from types import SimpleNamespace
import httpx,pytest
from app import config,media,media_transport as t,gemini_client as pb,usage
@pytest.fixture
def meter(monkeypatch):
 rows=[]
 for name in ('reserve','dispatch','settle','uncertain','release'):
  def record(*args,_name=name,**kwargs):rows.append((_name,kwargs));return SimpleNamespace(id='fixture') if _name=='reserve' else None
  monkeypatch.setattr(usage,name,record)
 monkeypatch.setattr(config,'GEMINI_API_KEY','fixture-only');monkeypatch.setattr(config,'FAL_KEY','fixture-only');return rows
def reply(code,body):return httpx.Response(code,json=body,request=httpx.Request('GET','https://generativelanguage.googleapis.com/v1beta/models/fixture:generateContent'))
def test_fal_credentials_ignore_returned_urls(meter,monkeypatch):
 calls=[]
 def request(method,url,**kw):
  calls.append(url)
  if method=='POST':return reply(200,{'request_id':'job_fixture','status_url':'https://evil.example/','response_url':'http://169.254.169.254/'})
  return reply(200,{'status':'COMPLETED'} if url.endswith('/status') else {'images':[{'url':'https://cdn.example/fixture.png'}]})
 monkeypatch.setattr(t,'request',request)
 with t.attempt('fal','fal-ai/nano-banana',.08):media._submit_and_wait('fal-ai/nano-banana',{'prompt':'fixture'})
 assert all(x.startswith('https://queue.fal.run/fal-ai/nano-banana') for x in calls) and meter[-1][0]=='settle'


def test_mock_svg_escaped(tmp_path):
 path=tmp_path/'fixture.svg';media._mock_image('<script>alert(1)</script>','1:1',path)
 assert '<script>' not in path.read_text() and '&lt;script&gt;' in path.read_text()


def test_provider_compression_rejected_before_decode_retains_uncertain(meter,monkeypatch):
 original=httpx.Client;seen=[]
 class NeverDecode(httpx.SyncByteStream):
  def __iter__(self):pytest.fail('compressed provider body must not be iterated')
 def handle(req):
  seen.append(req)
  return httpx.Response(200,headers={'content-encoding':'gzip'},stream=NeverDecode())
 monkeypatch.setattr(httpx,'Client',lambda **kwargs:original(transport=httpx.MockTransport(handle),**kwargs))
 with pytest.raises(ValueError,match='provider_response_encoding'):
  with t.attempt('gemini','gemini-3.1-flash-image',0):
   t.before_submit({'prompt':'fixture'})
   t.request('POST','https://generativelanguage.googleapis.com/v1beta/models/fixture:generateContent',headers={'Authorization':'fixture','accept-encoding':'gzip'},json_body={'prompt':'fixture'})
 assert len(seen)==1 and seen[0].headers['accept-encoding']=='identity'
 assert meter[-1][0]=='uncertain'


def test_planned_model_uses_actual_primary_mapping(monkeypatch):
 monkeypatch.setattr(config,'MEDIA_PROVIDER','gemini')
 assert media.planned_model('image')=='gemini:'+config.GEMINI_MODELS['image_final']
 monkeypatch.setattr(config,'MEDIA_PROVIDER','fal')
 assert media.planned_model('image')=='fal:'+config.MEDIA_MODELS['image_final']


