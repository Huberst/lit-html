/**
 * @license
 * Copyright (c) 2020 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt The complete set of authors may be found
 * at http://polymer.github.io/AUTHORS.txt The complete set of contributors may
 * be found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by
 * Google as part of the polymer project is also subject to an additional IP
 * rights grant found at http://polymer.github.io/PATENTS.txt
 */

import {fnva64} from './fnva64.js';

/**
 * Delimiter used between each template string component before hashing. Used to
 * prevent e.g. "foobar" and "foo${baz}bar" from sharing a hash.
 *
 * This is the "record separator" ASCII character.
 */
export const HASH_DELIMITER = String.fromCharCode(30);

/**
 * Id scheme version prefix to distinguish this implementation from potential
 * changes in the future.
 */
const VERSION_PREFIX = '0';

/**
 * Id prefix on html-tagged templates to distinguish e.g. `<b>x</b>` from
 * html`<b>x</b>`.
 */
const HTML_PREFIX = 'h';

/**
 * Id prefix on plain string templates to distinguish e.g. `<b>x</b>` from
 * html`<b>x</b>`.
 */
const STRING_PREFIX = 's';

/**
 * Generate a unique ID for a lit-localize message.
 *
 * Example:
 *   Template: html`Hello <b>${who}</b>!`
 *     Params: ["Hello <b>", "</b>!"], true
 *     Output: 0h82ccc38d4d46eaa9
 *
 * The ID is constructed as:
 *
 *   [0]    Version number indicating this ID generation scheme.
 *   [1]    Kind of template: [h]tml or [s]string.
 *   [2,17] 64-bit FNV-A hash hex digest of the template strings, where each
 *          string is UTF-8 encoded and delineated by an ASCII "record separator"
 *          character.
 *
 * We choose FNV-A because:
 *
 *   1. It's pretty fast (e.g. much faster than SHA-1).
 *   2. It's pretty small (0.41 KiB minified + brotli).
 *   3. We don't require cryptographic security, and 64 bits should give sufficient
 *      collision resistance for any one application. Worst case, we will always
 *      detect collisions during analysis.
 *   4. We can't use Web Crypto API (e.g. SHA-1), because it's asynchronous.
 *   6. There was an existing JavaScript implementation that doesn't require BigInt,
 *      for IE11 compatibility.
 */
export function generateMsgId(
  strings: string | string[] | TemplateStringsArray,
  isHtmlTagged: boolean
): string {
  return (
    VERSION_PREFIX +
    (isHtmlTagged ? HTML_PREFIX : STRING_PREFIX) +
    fnva64(typeof strings === 'string' ? strings : strings.join(HASH_DELIMITER))
  );
}
