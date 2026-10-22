import os, unittest
os.environ.update(UPDATER_TOKEN='t', COMPOSE_DIR='/tmp', SERVICE='albm', IMAGE='ghcr.io/x/albm')
import importlib.util
spec = importlib.util.spec_from_file_location('u', os.path.join(os.path.dirname(__file__), 'albm-updater.py'))
u = importlib.util.module_from_spec(spec); spec.loader.exec_module(u)

class T(unittest.TestCase):
    def test_swap(self):
        new, old = u.swap_tag('services:\n  albm:\n    image: ghcr.io/x/albm:2.1.1\n', '2.2.0')
        self.assertEqual(old, '2.1.1'); self.assertIn('albm:2.2.0', new)
    def test_swap_needs_one_line(self):
        with self.assertRaises(ValueError): u.swap_tag('services: {}\n', '2.2.0')
        with self.assertRaises(ValueError): u.swap_tag('image: ghcr.io/x/albm:1.0.0\nimage: ghcr.io/x/albm:1.0.1\n', '2.2.0')
    def test_version_re(self):
        for v in ('2.2.0', '10.0.12'): self.assertTrue(u.VERSION_RE.match(v))
        for v in ('latest', '2.2', '2.2.0; rm', '2.2.0-rc1', '../x'): self.assertFalse(u.VERSION_RE.match(v))

unittest.main()
