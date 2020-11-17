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

import {litLocalizeTransform} from '../outputters/transform';
import * as ts from 'typescript';
import {Message, makeMessageIdMap} from '../messages';
import test, {ExecutionContext} from 'ava';
import * as prettier from 'prettier';
import {compileTsFragment, CompilerHostCache} from './compile-ts-fragment';

const cache = new CompilerHostCache();
const IMPORT_MSG = `import { msg } from "./lit-localize.js";\n`;
const IMPORT_LIT_HTML = `import { html } from "lit-html";\n`;

/**
 * Compile the given fragment of TypeScript source code using the lit-localize
 * litLocalizeTransformer with the given translations. Check that there are no errors and
 * that the output matches (prettier-formatted).
 */
function checkTransform(
  t: ExecutionContext,
  inputTs: string,
  expectedJs: string,
  opts?: {
    messages?: Message[];
    autoImport?: boolean;
    locale?: string;
  }
) {
  if (opts?.autoImport ?? true) {
    // Rather than fuss with imports in all the test cases, this little hack
    // automatically imports for `msg` and `html` (assuming those strings aren't
    // used with any other meanings).
    if (inputTs.includes('msg')) {
      inputTs = IMPORT_MSG + inputTs;
      // Note we don't expect to see the `msg` import in the output JS, since it
      // should be un-used after litLocalizeTransformation.
    }
    if (inputTs.includes('html')) {
      inputTs = IMPORT_LIT_HTML + inputTs;
      expectedJs = IMPORT_LIT_HTML + expectedJs;
    }
  }
  const options = ts.getDefaultCompilerOptions();
  options.target = ts.ScriptTarget.ES2015;
  options.module = ts.ModuleKind.ESNext;
  options.moduleResolution = ts.ModuleResolutionKind.NodeJs;
  // Don't automatically load typings from nodes_modules/@types, we're not using
  // them here, so it's a waste of time.
  options.typeRoots = [];
  const result = compileTsFragment(inputTs, options, cache, (program) => ({
    before: [
      litLocalizeTransform(
        makeMessageIdMap(opts?.messages ?? []),
        opts?.locale ?? 'en',
        program
      ),
    ],
  }));

  let formattedExpected = prettier.format(expectedJs, {parser: 'typescript'});
  // TypeScript >= 4 will add an empty export statement if there are no imports
  // or exports to ensure this is a module. We don't care about checking this.
  const unformattedActual = (result.code || '').replace('export {};', '');
  let formattedActual;
  try {
    formattedActual = prettier.format(unformattedActual, {
      parser: 'typescript',
    });
  } catch {
    // We might emit invalid TypeScript in a failing test. Rather than fail with
    // a Prettier parse exception, it's more useful to see a diff.
    formattedExpected = expectedJs;
    formattedActual = unformattedActual;
  }
  t.is(formattedActual, formattedExpected);
  t.deepEqual(result.diagnostics, []);
}

test('unchanged const', (t) => {
  const src = 'const foo = "foo";';
  checkTransform(t, src, src);
});

test('unchanged html', (t) => {
  const src =
    'const foo = "foo"; const bar = "bar"; html`Hello ${foo} and ${bar}!`;';
  checkTransform(t, src, src);
});

test('msg(string)', (t) => {
  checkTransform(t, 'msg("Hello World", {id: "foo"});', '"Hello World";');
});

test('msg(string) translated', (t) => {
  checkTransform(t, 'msg("foo", "Hello World");', '`Hola Mundo`;', {
    messages: [{name: 'foo', contents: ['Hola Mundo']}],
  });
});

test('html(msg(string))', (t) => {
  checkTransform(
    t,
    'html`<b>${msg("foo", "Hello World")}</b>`;',
    'html`<b>Hello World</b>`;'
  );
});

test('html(msg(string)) translated', (t) => {
  checkTransform(
    t,
    'html`<b>${msg("foo", "Hello World")}</b>`;',
    'html`<b>Hola Mundo</b>`;',
    {messages: [{name: 'foo', contents: ['Hola Mundo']}]}
  );
});

test('html(msg(html))', (t) => {
  checkTransform(
    t,
    'html`<b>${msg("foo", html`Hello <i>World</i>`)}</b>`;',
    'html`<b>Hello <i>World</i></b>`;'
  );
});

test('html(msg(html)) translated', (t) => {
  checkTransform(
    t,
    'html`<b>${msg("foo", html`Hello <i>World</i>`)}</b>`;',
    'html`<b>Hola <i>Mundo</i></b>`;',
    {
      messages: [
        {
          name: 'foo',
          contents: [
            'Hola ',
            {untranslatable: '<i>'},
            'Mundo',
            {untranslatable: '</i>'},
          ],
        },
      ],
    }
  );
});

test('msg(fn(string), expr)', (t) => {
  checkTransform(
    t,
    'const name = "World";' + 'msg("foo", (name) => `Hello ${name}!`, name);',
    'const name = "World";' + '`Hello ${name}!`;'
  );
});

test('msg(fn(string), expr) translated', (t) => {
  checkTransform(
    t,
    'const name = "World";' + 'msg("foo", (name) => `Hello ${name}!`, name);',
    'const name = "World";' + '`Hola ${name}!`;',
    {
      messages: [
        {
          name: 'foo',
          contents: ['Hola ', {untranslatable: '${name}'}, '!'],
        },
      ],
    }
  );
});

test('msg(fn(string), string)', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => `Hello ${name}!`, "World");',
    '`Hello World!`;'
  );
});

test('msg(fn(string), string) translated', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => `Hello ${name}!`, "World");',
    '`Hola World!`;',
    {
      messages: [
        {
          name: 'foo',
          contents: ['Hola ', {untranslatable: '${name}'}, '!'],
        },
      ],
    }
  );
});

test('msg(fn(html), expr)', (t) => {
  checkTransform(
    t,
    'const name = "World";' +
      'msg("foo", (name) => html`Hello <b>${name}</b>!`, name);',
    'const name = "World";' + 'html`Hello <b>${name}</b>!`;'
  );
});

test('msg(fn(html), expr) translated', (t) => {
  checkTransform(
    t,
    'const name = "World";' +
      'msg("foo", (name) => html`Hello <b>${name}</b>!`, name);',
    'const name = "World";' + 'html`Hola <b>${name}</b>!`;',
    {
      messages: [
        {
          name: 'foo',
          contents: ['Hola ', {untranslatable: '<b>${name}</b>'}, '!'],
        },
      ],
    }
  );
});

test('msg(fn(html), string)', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => html`Hello <b>${name}</b>!`, "World");',
    'html`Hello <b>World</b>!`;'
  );
});

test('msg(fn(html), string) translated', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => html`Hello <b>${name}</b>!`, "World");',
    'html`Hola <b>World</b>!`;',
    {
      messages: [
        {
          name: 'foo',
          contents: ['Hola ', {untranslatable: '<b>${name}</b>'}, '!'],
        },
      ],
    }
  );
});

test('msg(fn(html), html)', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => html`Hello <b>${name}</b>!`, html`<i>World</i>`);',
    'html`Hello <b><i>World</i></b>!`;'
  );
});

test('msg(fn(html), html) translated', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => html`Hello <b>${name}</b>!`, html`<i>World</i>`);',
    'html`Hola <b><i>World</i></b>!`;',
    {
      messages: [
        {
          name: 'foo',
          contents: ['Hola ', {untranslatable: '<b>${name}</b>'}, '!'],
        },
      ],
    }
  );
});

test('msg(fn(string), msg(string))', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => `Hello ${name}!`, msg("bar", "World"));',
    '`Hello World!`;'
  );
});

test('msg(fn(string), msg(string)) translated', (t) => {
  checkTransform(
    t,
    'msg("foo", (name) => `Hello ${name}!`, msg("bar", "World"));',
    '`Hola Mundo!`;',
    {
      messages: [
        {
          name: 'foo',
          contents: ['Hola ', {untranslatable: '${name}'}, '!'],
        },
        {
          name: 'bar',
          contents: ['Mundo'],
        },
      ],
    }
  );
});

test('import * as litLocalize', (t) => {
  checkTransform(
    t,
    `
    import * as litLocalize from './lit-localize.js';
    litLocalize.msg("foo", "Hello World");
  `,
    '"Hello World";',
    {autoImport: false}
  );
});

test('import {msg as foo}', (t) => {
  checkTransform(
    t,
    `
    import {msg as foo} from './lit-localize.js';
    foo("foo", "Hello World");
  `,
    '"Hello World";',
    {autoImport: false}
  );
});

test('exclude different msg function', (t) => {
  checkTransform(
    t,
    `function msg(id: string, template: string) { return template; }
    msg("foo", "Hello World");`,
    `function msg(id, template) { return template; }
    msg("foo", "Hello World");`,
    {autoImport: false}
  );
});

test('configureTransformLocalization() -> {getLocale: () => "es-419"}', (t) => {
  checkTransform(
    t,
    `import {configureTransformLocalization} from './lit-localize.js';
     const {getLocale} = configureTransformLocalization({
       sourceLocale: 'en',
     });
     const locale = getLocale();`,
    `const {getLocale} = {getLocale: () => 'es-419'};
     const locale = getLocale();`,
    {locale: 'es-419'}
  );
});

test('configureLocalization() throws', (t) => {
  t.throws(
    () =>
      checkTransform(
        t,
        `import {configureLocalization} from './lit-localize.js';
         configureLocalization({
           sourceLocale: 'en',
           targetLocales: ['es-419'],
           loadLocale: (locale: string) => import(\`/\${locale}.js\`),
         });`,
        ``
      ),
    undefined,
    'Cannot use configureLocalization in transform mode'
  );
});

test('LOCALE_STATUS_EVENT => "lit-localize-status"', (t) => {
  checkTransform(
    t,
    `import {LOCALE_STATUS_EVENT} from './lit-localize.js';
     window.addEventListener(LOCALE_STATUS_EVENT, () => console.log('ok'));`,
    `window.addEventListener('lit-localize-status', () => console.log('ok'));`
  );
});

test('litLocalize.LOCALE_STATUS_EVENT => "lit-localize-status"', (t) => {
  checkTransform(
    t,
    `import * as litLocalize from './lit-localize.js';
     window.addEventListener(litLocalize.LOCALE_STATUS_EVENT, () => console.log('ok'));`,
    `window.addEventListener('lit-localize-status', () => console.log('ok'));`
  );
});

test('re-assigned LOCALE_STATUS_EVENT', (t) => {
  checkTransform(
    t,
    `import {LOCALE_STATUS_EVENT} from './lit-localize.js';
     const event = LOCALE_STATUS_EVENT;
     window.addEventListener(event, () => console.log('ok'));`,
    `const event = 'lit-localize-status';
     window.addEventListener(event, () => console.log('ok'));`
  );
});

test('different LOCALE_STATUS_EVENT variable unchanged', (t) => {
  checkTransform(
    t,
    `const LOCALE_STATUS_EVENT = "x";`,
    `const LOCALE_STATUS_EVENT = "x";`
  );
});

test('different variable cast to "lit-localie-status" unchanged', (t) => {
  checkTransform(
    t,
    `const x = "x" as "lit-localize-status";`,
    `const x = "x";`
  );
});

test('Localized(LitElement) -> LitElement', (t) => {
  checkTransform(
    t,
    `import {LitElement, html} from 'lit-element';
     import {Localized} from './localized-element.js';
     import {msg} from './lit-localize.js';
     class MyElement extends Localized(LitElement) {
       render() {
         return html\`<b>\${msg('greeting', 'Hello World!')}</b>\`;
       }
     }`,
    `import {LitElement, html} from 'lit-element';
     class MyElement extends LitElement {
       render() {
         return html\`<b>Hello World!</b>\`;
       }
     }`,
    {autoImport: false}
  );
});
