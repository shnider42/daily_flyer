import unittest
from web import app

class NextChapterRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_theme_aliases_redirect_to_same_app(self):
        for name in ('next_chapter', 'next-chapter'):
            response = self.client.get('/?theme=' + name)
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.headers['Location'], '/next-chapter/')

    def test_public_assets_are_served(self):
        for name in ('', 'style.css', 'app.mjs', 'model.mjs', 'store.mjs', 'favicon.svg'):
            response = self.client.get('/next-chapter/' + name)
            self.assertEqual(response.status_code, 200, name)
            response.close()

    def test_non_public_files_and_traversal_are_rejected(self):
        for path in ('README.md', '../web.py', '%2E%2E/web.py', '.env'):
            self.assertEqual(self.client.get('/next-chapter/' + path).status_code, 404)

if __name__ == '__main__':
    unittest.main()
