"""Socket-free transport for DOM integration tests; disposable SQLite only."""
import json
import sys

from ww2_web import create_app

request = json.load(sys.stdin)
app = create_app(sys.argv[1])
with app.test_client() as client:
    response = client.open(request['path'], method=request.get('method', 'GET'),
                           headers=request.get('headers', {}), data=request.get('body'))
    print(json.dumps({'status': response.status_code, 'data': response.get_json()}))
