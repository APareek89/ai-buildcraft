"""Real HTTPX request/response contracts with zero network or paid provider calls."""
import base64
import io
import json
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image
from app import config, gemini_client as gemini, media, media_transport as transport, usage

@pytest.fixture
def meter(monkeypatch):
    rows = []
    for name in ('reserve', 'dispatch', 'settle', 'uncertain', 'release'):
        def record(*args, _name=name, **kwargs):
            rows.append((_name, kwargs))
            return SimpleNamespace(id='fixture') if _name == 'reserve' else None
        monkeypatch.setattr(usage, name, record)
    monkeypatch.setattr(config, 'GEMINI_API_KEY', 'fixture-key')
    return rows

@pytest.fixture
def png():
    output = io.BytesIO()
    Image.new('RGB', (2, 2), color='blue').save(output, format='PNG')
    return output.getvalue()

def wire(monkeypatch, handler):
    original = httpx.Client
    calls = []
    def respond(request):
        calls.append(request)
        status, body = handler(request)
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        return httpx.Response(status, headers={'content-type': 'video/mp4' if isinstance(body, bytes) else 'application/json'}, stream=httpx.ByteStream(data))
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    return calls

def output(png):
    return {'candidates': [{'content': {'parts': [{'text': 'Done'}, {'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(png).decode()}}]}}]}

@pytest.mark.parametrize('count', [0, 1, 2])
def test_image_generation_and_reference_edits_use_native_inline_parts(meter, monkeypatch, png, count):
    from app import safe_network, media_storage
    validated = []
    monkeypatch.setattr(media_storage, 'validate_provider_reference', validated.append)
    monkeypatch.setattr(safe_network, 'public_get', lambda *a, **kw: SimpleNamespace(body=png, content_type='image/png'))
    calls = wire(monkeypatch, lambda _: (200, output(png)))
    refs = [f'https://owned.example/image-{i}?signature=private' for i in range(count)]
    with transport.attempt('gemini', 'gemini-3.1-flash-image', 0):
        result = gemini.generate('image', 'Change the background', image_urls=refs, ratio='4:5', resolution='2K')
    assert len(calls) == 1 and calls[0].method == 'POST'
    assert str(calls[0].url) == gemini.BASE + '/models/gemini-3.1-flash-image:generateContent'
    assert calls[0].headers['x-goog-api-key'] == 'fixture-key' and 'key=' not in str(calls[0].url)
    body = json.loads(calls[0].content)
    assert body['contents'][0]['parts'] == [{'text': 'Change the background'}] + [{'inlineData': {'mimeType':'image/png','data':base64.b64encode(png).decode()}}] * count
    assert body['generationConfig'] == {'responseModalities':['TEXT','IMAGE'], 'imageConfig': {'aspectRatio':'4:5','imageSize':'2K'}}
    assert validated == refs and result['data'] == png and result['model'].startswith('gemini:')
    assert meter[-1][0] == 'settle' and meter[-1][1]['actual_usd'] is None
    assert 'private' not in str(result['params'])

@pytest.mark.parametrize('body', [{'promptFeedback': {'blockReason':'SAFETY'}}, {'candidates':[{'finishReason':'IMAGE_SAFETY'}]}])
def test_safety_block_is_terminal_and_never_falls_back(meter, monkeypatch, body):
    calls = wire(monkeypatch, lambda _: (200, body))
    with pytest.raises(gemini.GeminiError) as error, transport.attempt('gemini','fixture',0):
        gemini.generate('image', 'fixture')
    assert error.value.policy and not error.value.safe_to_fallback and len(calls) == 1
    assert meter[-1][0] == 'settle'

@pytest.mark.parametrize('body', [{}, {'candidates': None}, {'candidates': [None]}, {'candidates':[{'content':{'parts':[{'text':'No output'}]}}]}, {'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'image/png','data':'not base64'}}]}}]}])
def test_missing_or_malformed_image_retains_uncertain_charge(meter, monkeypatch, body):
    calls = wire(monkeypatch, lambda _: (200, body))
    with pytest.raises(gemini.GeminiError), transport.attempt('gemini','fixture',0):
        gemini.generate('image','fixture')
    assert len(calls) == 1 and meter[-1][0] == 'uncertain'

@pytest.mark.parametrize('status', [400, 401, 429, 503])
def test_http_failure_never_retries_or_logs_provider_prose(meter, monkeypatch, caplog, status):
    calls = wire(monkeypatch, lambda _: (status, {'error': {'status':'INVALID_ARGUMENT','message':'sensitive-prompt signed-url'}}))
    with pytest.raises(gemini.GeminiError) as error, transport.attempt('gemini','fixture',0):
        gemini.generate('image','fixture')
    assert len(calls) == 1 and not error.value.safe_to_fallback
    assert 'sensitive-prompt' not in caplog.text and 'signed-url' not in caplog.text
    assert meter[-1][0] == ('settle' if status < 500 else 'uncertain')

def test_timeout_is_uncertain_without_duplicate_dispatch(meter, monkeypatch):
    def fail(*args, **kwargs): raise httpx.ReadTimeout('private fixture')
    monkeypatch.setattr(transport, 'request', fail)
    with pytest.raises(gemini.GeminiError), transport.attempt('gemini','fixture',0):
        gemini.generate('image','fixture')
    assert [name for name, _ in meter] == ['reserve','dispatch','uncertain']

def test_video_polls_and_downloads_using_fixed_google_origin(meter, monkeypatch, png):
    monkeypatch.setattr(gemini, '_reference', lambda _: {'mimeType':'image/png','data':base64.b64encode(png).decode()})
    mp4 = b'\x00\x00\x00\x18ftypmp42' + b'fixture'
    def respond(request):
        if request.method == 'POST': return 200, {'name':'models/veo-3.1-generate-preview/operations/fixture'}
        if ':download' in request.url.path: return 200, mp4
        return 200, {'done': True, 'response': {'generateVideoResponse': {'generatedSamples':[{'video': {'uri': gemini.BASE + '/files/fixture:download?alt=media'}}]}}}
    calls = wire(monkeypatch, respond)
    with transport.attempt('gemini','veo-3.1-generate-preview',0):
        result = gemini.generate('video','A slow camera move', image_urls=['start','end'], duration_s=5,ratio='16:9')
    assert [r.method for r in calls] == ['POST','GET','GET']
    body = json.loads(calls[0].content)
    assert set(body['instances'][0]) == {'prompt','image','lastFrame'}
    assert body['parameters']['durationSeconds'] == 4
    assert result['data'] == mp4 and result['params']['duration'] == 4
    assert meter[-1][0] == 'settle' and meter[-1][1]['provider_job_id'] == 'fixture'

@pytest.mark.parametrize('name', ['https://evil.example/operations/a', '../admin', 'models/other/operations/a'])
def test_invalid_operation_never_forms_authenticated_poll(meter, monkeypatch, name):
    calls = wire(monkeypatch, lambda _: (200, {'name':name}))
    with pytest.raises(gemini.GeminiError), transport.attempt('gemini','fixture',0):
        gemini.generate('video','fixture')
    assert len(calls) == 1 and meter[-1][0] == 'uncertain'

def test_foreign_video_uri_is_rejected_before_key_can_leave_google(monkeypatch):
    monkeypatch.setattr(transport,'request',lambda *a, **kw: pytest.fail('must not dispatch'))
    with pytest.raises(gemini.GeminiError):gemini._download_video('https://evil.example/files/fixture:download')

def test_owned_reference_validation_precedes_dispatch(meter, monkeypatch):
    def reject(_): raise PermissionError('foreign owner')
    monkeypatch.setattr('app.media_storage.validate_provider_reference',reject)
    monkeypatch.setattr(transport,'request',lambda *a, **kw: pytest.fail('must not dispatch'))
    with pytest.raises(PermissionError), transport.attempt('gemini','fixture',0):
        gemini.generate('image','fixture',image_urls=['https://foreign.example/photo'])
    assert [name for name,_ in meter] == ['reserve','release']

def test_router_writes_gemini_bytes_to_asset_file(meter,monkeypatch,tmp_path,png):
    monkeypatch.setattr(config,'MOCK_MEDIA',False)
    monkeypatch.setattr(config,'MEDIA_PROVIDER','gemini')
    monkeypatch.setattr(config,'ASSET_DIR',tmp_path)
    wire(monkeypatch, lambda _: (200, output(png)))
    result = media.generate('image','Blue sample',ratio='1:1')
    from pathlib import Path
    assert Path(result['path']).read_bytes() == png
    assert result['provider'] == 'gemini' and result['model'] == 'gemini:gemini-3.1-flash-image'
    assert result['url'] == '' and not result['fallback']
