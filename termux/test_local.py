"""Offline tests only: never log in to Telegram or consume a real lease."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import console
from self_client import calculate


class LocalSafetyTests(unittest.TestCase):
    def test_url_accepts_only_a_trusted_https_origin(self):
        self.assertEqual(console.safe_url('https://nova.example.org/'), 'https://nova.example.org')
        for value in ['http://example.org', 'https://user:pass@example.org', 'https://example.org/token', 'https://example.org?q=secret', 'file:///tmp/a', 'https://example.org/#token']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                console.safe_url(value)

    def test_credentials_have_private_file_and_directory_permissions(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp) / 'private'
            with patch.object(console, 'STATE', state):
                console.save_private('terminal.json', {'token': 'unit-test-placeholder'})
                self.assertEqual(console.load_private('terminal.json')['token'], 'unit-test-placeholder')
                self.assertEqual((state / 'terminal.json').stat().st_mode & 0o777, 0o600)
                self.assertEqual(state.stat().st_mode & 0o777, 0o700)

    def test_api_cannot_escape_its_own_origin(self):
        api = console.Api('https://nova.example.org', 'test-only')
        for path in ['https://evil.test/api/x', '//evil.test/api/x', '/api/../secrets']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                api.request(path)

    def test_safe_arithmetic(self):
        self.assertEqual(calculate('(12+3)*2'), 30)
        self.assertEqual(calculate('-5/2'), -2.5)
        self.assertEqual(calculate('10%3'), 1)

    def test_arithmetic_has_no_eval_or_unbounded_exponents(self):
        for expression in ['__import__("os").system("id")', '2**999999', 'False', '[1][0]', '1e999', '"secret"']:
            with self.subTest(expression=expression), self.assertRaises((ValueError, OverflowError, SyntaxError)):
                calculate(expression)

    def test_owner_ids_match_the_requested_accounts(self):
        self.assertEqual(console.OWNERS, {8882866473, 7856615968})


if __name__ == '__main__':
    unittest.main()
