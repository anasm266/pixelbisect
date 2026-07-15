import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml } from '../../src/html.js';

test('escapes every HTML-sensitive character in repository content', () => {
  assert.equal(escapeHtml(`<script x="'">&`), '&lt;script x=&quot;&#39;&quot;&gt;&amp;');
});
