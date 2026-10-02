"""Run the redistributable checks with isolated storage and blocked Python sockets."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
ROOT=Path(__file__).resolve().parents[1]
GATES=['media_provider_contract.py','portfolio_example_contract.py','qa_deck.py','qa_accept.py','smoke_mock.py','release_mock_contract.py']
with tempfile.TemporaryDirectory(prefix='buildcraft-free-') as scratch:
    home=Path(scratch)
    (home/'sitecustomize.py').write_text('import socket\ndef blocked(*a, **kw): raise RuntimeError("Network blocked by free-check harness")\nsocket.socket.connect = socket.socket.connect_ex = socket.create_connection = blocked\n')
    env={**os.environ,'PYTHONPATH':str(home)+os.pathsep+str(ROOT),'PYTHON_DOTENV_DISABLED':'1','MOCK_LLM':'1','PORTFOLIO_AUTH_ENABLED':'0','CLOUD_SYNC':'0','STORAGE_BACKEND':'local','LIVEKIT_URL':'','LIVEKIT_API_KEY':'','LIVEKIT_API_SECRET':''}
    for key in ('ANTHROPIC_API_KEY','GEMINI_API_KEY','RUNWARE_API_KEY','SARVAM_API_KEY','GCLOUD_TTS_API_KEY'):env[key]=''
    for i,gate in enumerate(GATES):
        env.update(DEMO_STUDIO_DATA=str(home/str(i)/'demos'),DEMO_STUDIO_GRAPH_DB=str(home/str(i)/'graph.sqlite'))
        result=subprocess.run([sys.executable,str(ROOT/'evals'/gate)],cwd=ROOT,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180)
        print(gate, 'PASS' if result.returncode==0 else 'FAIL', flush=True)
        print('\n'.join(result.stdout.splitlines()[-8:] if result.returncode==0 else result.stdout.splitlines()),flush=True)
        if result.returncode:sys.exit(result.returncode)
