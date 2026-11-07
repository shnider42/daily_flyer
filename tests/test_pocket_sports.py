import unittest
from web import app
class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.client=app.test_client()
    def test_registry_and_snapshots(self):
        self.assertEqual(self.client.get('/api/v1/sports').json['schema_version'],1)
        for sport,count in [('hockey',32),('soccer',16)]:
            r=self.client.get(f'/api/v1/sports/{sport}/teams')
            self.assertEqual(r.status_code,200)
            self.assertEqual(len(r.json['teams']),count)
            self.assertIn('asOf',r.json)
            self.assertEqual(self.client.get(f'/api/v1/sports/{sport}/teams',headers={'If-None-Match':r.headers['ETag']}).status_code,304)
    def test_invalid_catalogue_and_traversal(self):
        self.assertEqual(self.client.get('/api/v1/sports/unknown/teams').status_code,404)
        self.assertEqual(self.client.get('/sports/../backend/catalog.py').status_code,404)
    def test_routes_and_assets(self):
        for path in ['/hockey/','/soccer/']:
            self.assertEqual(self.client.get(path).status_code,302)
        for path in ['/sports/','/sports/app.js','/sports/core/engine.js','/pocket_sports_assets/core/pgi-controls.js','/pocket_sports_assets/core/device-audio.js']:
            with self.client.get(path) as response:
                self.assertEqual(response.status_code,200)
if __name__=='__main__':unittest.main()
