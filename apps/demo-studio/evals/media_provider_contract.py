"""Free Gemini transport and application-cache contracts; sockets are poisoned."""
import base64, io, json, os, socket, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import ExitStack
os.environ.update(MOCK_LLM='1', PORTFOLIO_AUTH_ENABLED='0', PYTHON_DOTENV_DISABLED='1', CLOUD_SYNC='0', STORAGE_BACKEND='local')
scratch = tempfile.TemporaryDirectory(prefix='buildcraft-media-')
os.environ.update(DEMO_STUDIO_DATA=scratch.name+'/demos', DEMO_STUDIO_GRAPH_DB=scratch.name+'/graph.sqlite')
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from PIL import Image
from server import config, media, store
from server.llm import image_media as m
REAL_CLIENT=httpx.Client
buffer=io.BytesIO();Image.new('RGB',(4,4),'white').save(buffer,format='PNG');PNG=buffer.getvalue()

class GeminiMediaTests(unittest.TestCase):
    def setUp(self):
        self.stack=ExitStack();self.addCleanup(self.stack.close)
        for name,value in [('MOCK_LLM',False),('GEMINI_API_KEY','test-only-not-a-real-key'),('MEDIA_PROVIDER_ORDER',['gemini'])]:self.stack.enter_context(patch.object(config,name,value))
        self.stack.enter_context(patch.object(socket.socket,'connect',side_effect=AssertionError('No network in free tests')))
        self.calls=[]
    def client(self,handler):
        def handle(request):self.calls.append(request);return handler(request)
        self.stack.enter_context(patch.object(m.httpx,'Client',side_effect=lambda **kw:REAL_CLIENT(transport=httpx.MockTransport(handle),**kw)))
    def success(self):return httpx.Response(200,json={'candidates':[{'finishReason':'STOP','content':{'parts':[{'inlineData':{'mimeType':'image/png','data':base64.b64encode(PNG).decode()}}]}}]})
    def test_mock_never_creates_client(self):
        with patch.object(config,'MOCK_LLM',True),patch.object(m.httpx,'Client',side_effect=AssertionError('Network disabled')):self.assertTrue(m.generate('Guide').mocked)
    def test_generation_contract_and_no_fabricated_price(self):
        def handler(request):
            self.assertEqual(str(request.url),f'{m.GEMINI_URL}/{config.GEMINI_IMAGE_MODEL}:generateContent')
            self.assertEqual(request.headers['x-goog-api-key'],'test-only-not-a-real-key')
            body=json.loads(request.content);self.assertEqual(body['contents'][0]['parts'],[{'text':'Guide mascot'}]);self.assertEqual(body['generationConfig']['imageConfig']['aspectRatio'],'1:1')
            return self.success()
        self.client(handler);out=m.generate('Guide mascot');self.assertEqual(out.provider,'gemini');self.assertIsNone(out.usd);self.assertIsNone(out.credits)
        self.assertEqual(Image.open(io.BytesIO(out.png)).format,'PNG')
    def test_edit_sends_reference_bytes(self):
        p=Path(scratch.name)/'source.png';p.write_bytes(PNG)
        def handler(request):
            body=json.loads(request.content);part=body['contents'][0]['parts'][1]['inlineData'];self.assertEqual(part['mimeType'],'image/png');self.assertEqual(base64.b64decode(part['data']),m._png(PNG));self.assertEqual(body['generationConfig']['imageConfig']['aspectRatio'],'4:3');return self.success()
        self.client(handler);m.generate('Clean background',reference=p,aspect='4:3');self.assertEqual(p.read_bytes(),PNG)
    def test_prompt_and_candidate_refusals_are_terminal(self):
        for body in [{'promptFeedback':{'blockReason':'SAFETY'}},{'candidates':[{'finishReason':'IMAGE_SAFETY'}]}]:
            with self.subTest(body=body),patch.object(m,'_json',return_value=body),self.assertRaises(m.SafetyRefusal):m.generate('Guide')
    def test_unknown_bad_request_and_redirect_fail_closed(self):
        self.client(lambda req:httpx.Response(400,json={'private':'secret provider body'}))
        with self.assertLogs('uvicorn.error',level='INFO') as logs,self.assertRaises(m.RequestRejected):m.generate('Guide')
        self.assertNotIn('secret provider body','\n'.join(logs.output));self.assertEqual(len(self.calls),1)
    def test_redirect_is_not_followed(self):
        self.client(lambda req:httpx.Response(302,headers={'location':'https://attacker.invalid/collect'}))
        with self.assertRaises(m.MediaError):m.generate('Guide')
        self.assertEqual(len(self.calls),1)
    def test_missing_and_corrupt_images_fail(self):
        for body in [{},{'candidates':[{'content':{'parts':[{'text':'No image'}]}}]},{'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'image/png','data':'YmFk'}}]}}]}]:
            with self.subTest(body=body),patch.object(m,'_json',return_value=body),self.assertRaises(m.MediaError):m.generate('Guide')
    def test_response_limit_is_enforced(self):
        self.client(lambda req:httpx.Response(200,content=b'x'*100))
        with patch.object(m,'MAX_JSON_BYTES',32),self.assertRaises(m.MediaError):m.generate('Guide')
    def test_cached_cleanup_retains_provenance(self):
        did=store.new_demo('Synthetic product')['id'];source={'id':'src1','kind':'image','name':'fixture.png','path':'sources/fixture.png','use_in_demo':True};store.path(did,source['path']).write_bytes(PNG)
        store.update(did,lambda d:d.update(sources=[source],settings={**d['settings'],'enhance_images':'ai'}))
        with patch.object(media,'needs_cleanup',return_value=(True,'Synthetic fixture')),patch.object(m,'generate',return_value=m.ImageResult(m._png(PNG),'gemini',config.GEMINI_IMAGE_MODEL)) as generation:media.enhance_images(did);media.enhance_images(did)
        self.assertEqual(generation.call_count,1);self.assertEqual(store.load(did)['sources'][0]['enhanced']['provider'],'gemini');self.assertEqual(store.path(did,source['path']).read_bytes(),PNG)
    def test_mascot_records_gemini_provider(self):
        did=store.new_demo('Synthetic guide')['id']
        with patch.object(m,'generate',return_value=m.ImageResult(m._png(PNG),'gemini',config.GEMINI_IMAGE_MODEL)) as generation:media.generate_mascot(did,{});media.generate_mascot(did,{})
        self.assertEqual(generation.call_count,1);self.assertEqual(store.load(did)['mascot_provider'],'gemini')
if __name__=='__main__':unittest.main()
