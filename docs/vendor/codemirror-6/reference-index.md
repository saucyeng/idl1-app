# Reference Manual

CodeMirror is published as a set of NPM packages under the `@codemirror` scope. The core packages are listed in this reference guide.

Each package exposes [ECMAScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) and [CommonJS](https://flaviocopes.com/commonjs/) modules. You'll have to use some kind of [bundler](https://www.freecodecamp.org/news/javascript-modules-part-2-module-bundling-5020383cf306/) or [loader](https://code.haverbeke.berlin/marijn/esmoduleserve) to run them in the browser.

The most important modules are [`state`](#state), which contains the data structures that model the editor state, and [`view`](#view), which provides the UI component for an editor.

A minimal editor might look like this:

```
import {EditorView, keymap} from "@codemirror/view"
import {defaultKeymap} from "@codemirror/commands"

let myView = new EditorView({
  doc: "hello",
  extensions: [keymap.of(defaultKeymap)],
  parent: document.body
})
```

But such an editor is going to be rather primitive. To get functionality like [highlighting](#language.defaultHighlightStyle), a [line number gutter](#view.lineNumbers), or an [undo history](#h_undo_history), you need to [add](#state.EditorStateConfig.extensions) more extensions to your editor.

To quickly get started, the [codemirror](#codemirror) package provides a bundle of extensions to set up a functioning editor.

## [@codemirror/state](#state)

In its most basic form, an editor's state is made up of a current [document](#state.EditorState.doc) and a [selection](#state.EditorState.selection). Because there are a lot of extra pieces that an editor might need to keep in its state (such as an [undo history](#commands.history) or [syntax tree](#language.syntaxTree)), it is possible for extensions to add additional [fields](#state.StateField) to the state object.

#### `interface` [EditorStateConfig](#state.EditorStateConfig)

Options passed when [creating](#state.EditorState%5Ecreate) an editor state.

`**[doc](#state.EditorStateConfig.doc)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [Text](#state.Text)`

The initial document. Defaults to an empty document. Can be provided either as a plain string (which will be split into lines according to the value of the [`lineSeparator` facet](#state.EditorState%5ElineSeparator)), or an instance of the [`Text`](#state.Text) class (which is what the state will use to represent the document).

`**[selection](#state.EditorStateConfig.selection)**⁠?: [EditorSelection](#state.EditorSelection) | {anchor: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), head⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

The starting selection. Defaults to a cursor at the very start of the document.

`**[extensions](#state.EditorStateConfig.extensions)**⁠?: [Extension](#state.Extension)`

[Extension(s)](#state.Extension) to associate with this state.

#### `class` [EditorState](#state.EditorState)

The editor state class is a persistent (immutable) data structure. To update a state, you [create](#state.EditorState.update) a [transaction](#state.Transaction), which produces a _new_ state instance, without modifying the original object.

As such, _never_ mutate properties of a state directly. That'll just break things.

`**[doc](#state.EditorState.doc)**: [Text](#state.Text)`

The current document.

`**[selection](#state.EditorState.selection)**: [EditorSelection](#state.EditorSelection)`

The current selection.

`**[field](#state.EditorState.field)**<[T](#state.EditorState.field^T)>([field](#state.EditorState.field^field): [StateField](#state.StateField)<[T](#state.EditorState.field^T)>) → [T](#state.EditorState.field^T)`

`**[field](#state.EditorState.field)**<[T](#state.EditorState.field^T)>([field](#state.EditorState.field^field): [StateField](#state.StateField)<[T](#state.EditorState.field^T)>, [require](#state.EditorState.field^require): [false](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [T](#state.EditorState.field^T) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Retrieve the value of a [state field](#state.StateField). Throws an error when the state doesn't have that field, unless you pass `false` as second parameter.

`**[update](#state.EditorState.update)**(...[specs](#state.EditorState.update^specs): readonly [TransactionSpec](#state.TransactionSpec)[]) → [Transaction](#state.Transaction)`

Create a [transaction](#state.Transaction) that updates this state. Any number of [transaction specs](#state.TransactionSpec) can be passed. Unless [`sequential`](#state.TransactionSpec.sequential) is set, the [changes](#state.TransactionSpec.changes) (if any) of each spec are assumed to start in the _current_ document (not the document produced by previous specs), and its [selection](#state.TransactionSpec.selection) and [effects](#state.TransactionSpec.effects) are assumed to refer to the document created by its _own_ changes. The resulting transaction contains the combined effect of all the different specs. For [selection](#state.TransactionSpec.selection), later specs take precedence over earlier ones.

`**[replaceSelection](#state.EditorState.replaceSelection)**([text](#state.EditorState.replaceSelection^text): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [Text](#state.Text)) → [TransactionSpec](#state.TransactionSpec)`

Create a [transaction spec](#state.TransactionSpec) that replaces every selection range with the given content.

`**[changeByRange](#state.EditorState.changeByRange)**(  [f](#state.EditorState.changeByRange^f): fn([range](#state.EditorState.changeByRange^f^range): [SelectionRange](#state.SelectionRange)) → {  range: [SelectionRange](#state.SelectionRange),  changes⁠?: [ChangeSpec](#state.ChangeSpec),  effects⁠?: [StateEffect](#state.StateEffect)<any> | readonly [StateEffect](#state.StateEffect)<any>[]  }  ) → {  changes: [ChangeSet](#state.ChangeSet),  selection: [EditorSelection](#state.EditorSelection),  effects: readonly [StateEffect](#state.StateEffect)<any>[]  }`

Create a set of changes and a new selection by running the given function for each range in the active selection. The function can return an optional set of changes (in the coordinate space of the start document), plus an updated range (in the coordinate space of the document produced by the call's own changes). This method will merge all the changes and ranges into a single changeset and selection, and return it as a [transaction spec](#state.TransactionSpec), which can be passed to [`update`](#state.EditorState.update).

`**[changes](#state.EditorState.changes)**([spec](#state.EditorState.changes^spec)⁠?: [ChangeSpec](#state.ChangeSpec) = []) → [ChangeSet](#state.ChangeSet)`

Create a [change set](#state.ChangeSet) from the given change description, taking the state's document length and line separator into account.

`**[toText](#state.EditorState.toText)**([string](#state.EditorState.toText^string): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Text](#state.Text)`

Using the state's [line separator](#state.EditorState%5ElineSeparator), create a [`Text`](#state.Text) instance from the given string.

`**[sliceDoc](#state.EditorState.sliceDoc)**([from](#state.EditorState.sliceDoc^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0, [to](#state.EditorState.sliceDoc^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = this.doc.length) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Return the given range of the document as a string.

`**[facet](#state.EditorState.facet)**<[Output](#state.EditorState.facet^Output)>([facet](#state.EditorState.facet^facet): [FacetReader](#state.FacetReader)<[Output](#state.EditorState.facet^Output)>) → [Output](#state.EditorState.facet^Output)`

Get the value of a state [facet](#state.Facet).

`**[toJSON](#state.EditorState.toJSON)**([fields](#state.EditorState.toJSON^fields)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[StateField](#state.StateField)<any>>) → any`

Convert this state to a JSON-serializable object. When custom fields should be serialized, you can pass them in as an object mapping property names (in the resulting object, which should not use `doc` or `selection`) to fields.

`**[tabSize](#state.EditorState.tabSize)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The size (in columns) of a tab in the document, determined by the [`tabSize`](#state.EditorState%5EtabSize) facet.

`**[lineBreak](#state.EditorState.lineBreak)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Get the proper [line-break](#state.EditorState%5ElineSeparator) string for this state.

`**[readOnly](#state.EditorState.readOnly)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns true when the editor is [configured](#state.EditorState%5EreadOnly) to be read-only.

`**[phrase](#state.EditorState.phrase)**([phrase](#state.EditorState.phrase^phrase): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), ...[insert](#state.EditorState.phrase^insert): any[]) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Look up a translation for the given phrase (via the [`phrases`](#state.EditorState%5Ephrases) facet), or return the original string if no translation is found.

If additional arguments are passed, they will be inserted in place of markers like `$1` (for the first value) and `$2`, etc. A single `$` is equivalent to `$1`, and `$$` will produce a literal dollar sign.

`**[languageDataAt](#state.EditorState.languageDataAt)**<[T](#state.EditorState.languageDataAt^T)>([name](#state.EditorState.languageDataAt^name): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [pos](#state.EditorState.languageDataAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [side](#state.EditorState.languageDataAt^side)⁠?: -1 | 0 | 1 = -1) → readonly [T](#state.EditorState.languageDataAt^T)[]`

Find the values for a given language data field, provided by the the [`languageData`](#state.EditorState%5ElanguageData) facet.

Examples of language data fields are...

*   [`"commentTokens"`](#commands.CommentTokens) for specifying comment syntax.
*   [`"autocomplete"`](#autocomplete.autocompletion%5Econfig.override) for providing language-specific completion sources.
*   [`"wordChars"`](#state.EditorState.charCategorizer) for adding characters that should be considered part of words in this language.
*   [`"closeBrackets"`](#autocomplete.CloseBracketConfig) controls bracket closing behavior.

`**[charCategorizer](#state.EditorState.charCategorizer)**([at](#state.EditorState.charCategorizer^at): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → fn([char](#state.EditorState.charCategorizer^returns^char): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [CharCategory](#state.CharCategory)`

Return a function that can categorize strings (expected to represent a single [grapheme cluster](#state.findClusterBreak)) into one of:

*   Word (contains an alphanumeric character or a character explicitly listed in the local language's `"wordChars"` language data, which should be a string)
*   Space (contains only whitespace)
*   Other (anything else)

`**[wordAt](#state.EditorState.wordAt)**([pos](#state.EditorState.wordAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [SelectionRange](#state.SelectionRange) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Find the word at the given position, meaning the range containing all [word](#state.CharCategory.Word) characters around it. If no word characters are adjacent to the position, this returns null.

`static **[fromJSON](#state.EditorState^fromJSON)**(  [json](#state.EditorState^fromJSON^json): any,  [config](#state.EditorState^fromJSON^config)⁠?: [EditorStateConfig](#state.EditorStateConfig) = {},  [fields](#state.EditorState^fromJSON^fields)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[StateField](#state.StateField)<any>>  ) → [EditorState](#state.EditorState)`

Deserialize a state from its JSON representation. When custom fields should be deserialized, pass the same object you passed to [`toJSON`](#state.EditorState.toJSON) when serializing as third argument.

`static **[create](#state.EditorState^create)**([config](#state.EditorState^create^config)⁠?: [EditorStateConfig](#state.EditorStateConfig) = {}) → [EditorState](#state.EditorState)`

Create a new state. You'll usually only need this when initializing an editor—updated states are created by applying transactions.

`static **[allowMultipleSelections](#state.EditorState^allowMultipleSelections)**: [Facet](#state.Facet)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

A facet that, when enabled, causes the editor to allow multiple ranges to be selected. Be careful though, because by default the editor relies on the native DOM selection, which cannot handle multiple selections. An extension like [`drawSelection`](#view.drawSelection) can be used to make secondary selections visible to the user.

`static **[tabSize](#state.EditorState^tabSize)**: [Facet](#state.Facet)<[number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)>`

Configures the tab size to use in this state. The first (highest-precedence) value of the facet is used. If no value is given, this defaults to 4.

`static **[lineSeparator](#state.EditorState^lineSeparator)**: [Facet](#state.Facet)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)>`

The line separator to use. By default, any of `"\n"`, `"\r\n"` and `"\r"` is treated as a separator when splitting lines, and lines are joined with `"\n"`.

When you configure a value here, only that precise separator will be used, allowing you to round-trip documents through the editor without normalizing line separators.

`static **[readOnly](#state.EditorState^readOnly)**: [Facet](#state.Facet)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

This facet controls the value of the [`readOnly`](#state.EditorState.readOnly) getter, which is consulted by commands and extensions that implement editing functionality to determine whether they should apply. It defaults to false, but when its highest-precedence value is `true`, such functionality disables itself.

Not to be confused with [`EditorView.editable`](#view.EditorView%5Eeditable), which controls whether the editor's DOM is set to be editable (and thus focusable).

`static **[phrases](#state.EditorState^phrases)**: [Facet](#state.Facet)<[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>>`

Registers translation phrases. The [`phrase`](#state.EditorState.phrase) method will look through all objects registered with this facet to find translations for its argument.

`static **[languageData](#state.EditorState^languageData)**: [Facet](#state.Facet)<  fn([state](#state.EditorState^languageData^state): [EditorState](#state.EditorState), [pos](#state.EditorState^languageData^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [side](#state.EditorState^languageData^side): -1 | 0 | 1) → readonly [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>[]  >`

A facet used to register [language data](#state.EditorState.languageDataAt) providers.

`static **[changeFilter](#state.EditorState^changeFilter)**: [Facet](#state.Facet)<fn([tr](#state.EditorState^changeFilter^tr): [Transaction](#state.Transaction)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | readonly [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)[]>`

Facet used to register change filters, which are called for each transaction (unless explicitly [disabled](#state.TransactionSpec.filter)), and can suppress part of the transaction's changes.

Such a function can return `true` to indicate that it doesn't want to do anything, `false` to completely stop the changes in the transaction, or a set of ranges in which changes should be suppressed. Such ranges are represented as an array of numbers, with each pair of two numbers indicating the start and end of a range. So for example `[10, 20, 100, 110]` suppresses changes between 10 and 20, and between 100 and 110.

`static **[transactionFilter](#state.EditorState^transactionFilter)**: [Facet](#state.Facet)<  fn([tr](#state.EditorState^transactionFilter^tr): [Transaction](#state.Transaction)) → [TransactionSpec](#state.TransactionSpec) | readonly [TransactionSpec](#state.TransactionSpec)[]  >`

Facet used to register a hook that gets a chance to update or replace transaction specs before they are applied. This will only be applied for transactions that don't have [`filter`](#state.TransactionSpec.filter) set to `false`. You can either return a single transaction spec (possibly the input transaction), or an array of specs (which will be combined in the same way as the arguments to [`EditorState.update`](#state.EditorState.update)).

When possible, it is recommended to avoid accessing [`Transaction.state`](#state.Transaction.state) in a filter, since it will force creation of a state that will then be discarded again, if the transaction is actually filtered.

(This functionality should be used with care. Indiscriminately modifying transaction is likely to break something or degrade the user experience.)

`static **[transactionExtender](#state.EditorState^transactionExtender)**: [Facet](#state.Facet)<  fn([tr](#state.EditorState^transactionExtender^tr): [Transaction](#state.Transaction)) → [Pick](https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys)<[TransactionSpec](#state.TransactionSpec), "effects" | "annotations"> |  [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

This is a more limited form of [`transactionFilter`](#state.EditorState%5EtransactionFilter), which can only add [annotations](#state.TransactionSpec.annotations) and [effects](#state.TransactionSpec.effects). _But_, this type of filter runs even if the transaction has disabled regular [filtering](#state.TransactionSpec.filter), making it suitable for effects that don't need to touch the changes or selection, but do want to process every transaction.

Extenders run _after_ filters, when both are present.

#### `class` [SelectionRange](#state.SelectionRange)

A single selection range. When [`allowMultipleSelections`](#state.EditorState%5EallowMultipleSelections) is enabled, a [selection](#state.EditorSelection) may hold multiple ranges. By default, selections hold exactly one range.

`**[from](#state.SelectionRange.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The lower boundary of the range.

`**[to](#state.SelectionRange.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The upper boundary of the range.

`**[goalColumn](#state.SelectionRange.goalColumn)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

The goal column (stored vertical offset) associated with a cursor. This is used to preserve the vertical position when [moving](#view.EditorView.moveVertically) across lines of different length.

`**[anchor](#state.SelectionRange.anchor)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The anchor of the range—the side that doesn't move when you extend it.

`**[head](#state.SelectionRange.head)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The head of the range, which is moved when the range is [extended](#state.SelectionRange.extend).

`**[empty](#state.SelectionRange.empty)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

True when `anchor` and `head` are at the same position.

`**[assoc](#state.SelectionRange.assoc)**: -1 | 0 | 1`

If this is a cursor that is explicitly associated with the character on one of its sides, this returns the side. -1 means the character before its position, 1 the character after, and 0 means no association.

`**[undirectional](#state.SelectionRange.undirectional)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

A flag that, when set, makes some selection-extending commands treat the range's head and anchor as exchangeable, so that for example Shift-ArrowUp will make the lower side of the selection the anchor, even if that was the head before. Used to implement MacOS-style undirectional selections.

`**[bidiLevel](#state.SelectionRange.bidiLevel)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

The bidirectional text level associated with this cursor, if any.

`**[map](#state.SelectionRange.map)**([change](#state.SelectionRange.map^change): [ChangeDesc](#state.ChangeDesc), [assoc](#state.SelectionRange.map^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = -1) → [SelectionRange](#state.SelectionRange)`

Map this range through a change, producing a valid range in the updated document.

`**[extend](#state.SelectionRange.extend)**([from](#state.SelectionRange.extend^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.SelectionRange.extend^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = from, [assoc](#state.SelectionRange.extend^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0) → [SelectionRange](#state.SelectionRange)`

Extend this range to cover at least `from` to `to`.

`**[eq](#state.SelectionRange.eq)**([other](#state.SelectionRange.eq^other): [SelectionRange](#state.SelectionRange), [includeAssoc](#state.SelectionRange.eq^includeAssoc)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this range to another range.

`**[toJSON](#state.SelectionRange.toJSON)**() → any`

Return a JSON-serializable object representing the range.

`static **[fromJSON](#state.SelectionRange^fromJSON)**([json](#state.SelectionRange^fromJSON^json): any) → [SelectionRange](#state.SelectionRange)`

Convert a JSON representation of a range to a `SelectionRange` instance.

#### `class` [EditorSelection](#state.EditorSelection)

An editor selection holds one or more selection ranges.

`**[ranges](#state.EditorSelection.ranges)**: readonly [SelectionRange](#state.SelectionRange)[]`

The ranges in the selection, sorted by position. Ranges cannot overlap (but they may touch, if they aren't empty).

`**[mainIndex](#state.EditorSelection.mainIndex)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The index of the _main_ range in the selection (which is usually the range that was added last).

`**[map](#state.EditorSelection.map)**([change](#state.EditorSelection.map^change): [ChangeDesc](#state.ChangeDesc), [assoc](#state.EditorSelection.map^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = -1) → [EditorSelection](#state.EditorSelection)`

Map a selection through a change. Used to adjust the selection position for changes.

`**[eq](#state.EditorSelection.eq)**([other](#state.EditorSelection.eq^other): [EditorSelection](#state.EditorSelection), [includeAssoc](#state.EditorSelection.eq^includeAssoc)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this selection to another selection. By default, ranges are compared only by position. When `includeAssoc` is true, cursor ranges must also have the same [`assoc`](#state.SelectionRange.assoc) value.

`**[main](#state.EditorSelection.main)**: [SelectionRange](#state.SelectionRange)`

Get the primary selection range. Usually, you should make sure your code applies to _all_ ranges, by using methods like [`changeByRange`](#state.EditorState.changeByRange).

`**[asSingle](#state.EditorSelection.asSingle)**() → [EditorSelection](#state.EditorSelection)`

Make sure the selection only has one range. Returns a selection holding only the main range from this selection.

`**[addRange](#state.EditorSelection.addRange)**([range](#state.EditorSelection.addRange^range): [SelectionRange](#state.SelectionRange), [main](#state.EditorSelection.addRange^main)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = true) → [EditorSelection](#state.EditorSelection)`

Extend this selection with an extra range.

`**[replaceRange](#state.EditorSelection.replaceRange)**([range](#state.EditorSelection.replaceRange^range): [SelectionRange](#state.SelectionRange), [which](#state.EditorSelection.replaceRange^which)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = this.mainIndex) → [EditorSelection](#state.EditorSelection)`

Replace a given range with another range, and then normalize the selection to merge and sort ranges if necessary.

`**[toJSON](#state.EditorSelection.toJSON)**() → any`

Convert this selection to an object that can be serialized to JSON.

`static **[fromJSON](#state.EditorSelection^fromJSON)**([json](#state.EditorSelection^fromJSON^json): any) → [EditorSelection](#state.EditorSelection)`

Create a selection from a JSON representation.

`static **[single](#state.EditorSelection^single)**([anchor](#state.EditorSelection^single^anchor): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [head](#state.EditorSelection^single^head)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = anchor) → [EditorSelection](#state.EditorSelection)`

Create a selection holding a single range.

`static **[create](#state.EditorSelection^create)**(  [ranges](#state.EditorSelection^create^ranges): readonly [SelectionRange](#state.SelectionRange)[],  [mainIndex](#state.EditorSelection^create^mainIndex)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0  ) → [EditorSelection](#state.EditorSelection)`

Sort and merge the given set of ranges, creating a valid selection.

`static **[cursor](#state.EditorSelection^cursor)**(  [pos](#state.EditorSelection^cursor^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [assoc](#state.EditorSelection^cursor^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0,  [bidiLevel](#state.EditorSelection^cursor^bidiLevel)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [goalColumn](#state.EditorSelection^cursor^goalColumn)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [SelectionRange](#state.SelectionRange)`

Create a cursor selection range at the given position. You can safely ignore the optional arguments in most situations.

`static **[range](#state.EditorSelection^range)**(  [anchor](#state.EditorSelection^range^anchor): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [head](#state.EditorSelection^range^head): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [goalColumn](#state.EditorSelection^range^goalColumn)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [bidiLevel](#state.EditorSelection^range^bidiLevel)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [assoc](#state.EditorSelection^range^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [SelectionRange](#state.SelectionRange)`

Create a selection range.

`static **[undirectionalRange](#state.EditorSelection^undirectionalRange)**([from](#state.EditorSelection^undirectionalRange^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.EditorSelection^undirectionalRange^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [SelectionRange](#state.SelectionRange)`

Create an [undirectional](#state.SelectionRange.undirectional) selection range.

`enum **[CharCategory](#state.CharCategory)**`

The categories produced by a [character categorizer](#state.EditorState.charCategorizer). These are used do things like selecting by word.

`**[Word](#state.CharCategory.Word)**`

Word characters.

`**[Space](#state.CharCategory.Space)**`

Whitespace.

`**[Other](#state.CharCategory.Other)**`

Anything else.

### Text

The `Text` type stores documents in an immutable tree-shaped representation that allows:

*   Efficient indexing both by code unit offset and by line number.
    
*   Structure-sharing immutable updates.
    
*   Access to and iteration over parts of the document without copying or concatenating big strings.
    

Line numbers start at 1. Character positions are counted from zero, and count each line break and UTF-16 code unit as one unit.

#### `class` [Text](#state.Text) `implements [Iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_iterable_protocol)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

The data structure for documents.

`**[length](#state.Text.length)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The length of the string.

`**[lines](#state.Text.lines)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The number of lines in the string (always >= 1).

`**[lineAt](#state.Text.lineAt)**([pos](#state.Text.lineAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Line](#state.Line)`

Get the line description around the given position.

`**[line](#state.Text.line)**([n](#state.Text.line^n): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Line](#state.Line)`

Get the description for the given (1-based) line number.

`**[replace](#state.Text.replace)**([from](#state.Text.replace^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.Text.replace^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [text](#state.Text.replace^text): [Text](#state.Text)) → [Text](#state.Text)`

Replace a range of the text with the given content.

`**[append](#state.Text.append)**([other](#state.Text.append^other): [Text](#state.Text)) → [Text](#state.Text)`

Append another document to this one.

`**[slice](#state.Text.slice)**([from](#state.Text.slice^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.Text.slice^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = this.length) → [Text](#state.Text)`

Retrieve the text between the given points.

`**[sliceString](#state.Text.sliceString)**([from](#state.Text.sliceString^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.Text.sliceString^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [lineSep](#state.Text.sliceString^lineSep)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Retrieve a part of the document as a string

`**[eq](#state.Text.eq)**([other](#state.Text.eq^other): [Text](#state.Text)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Test whether this text is equal to another instance.

`**[iter](#state.Text.iter)**([dir](#state.Text.iter^dir)⁠?: 1 | -1 = 1) → [TextIterator](#state.TextIterator)`

Iterate over the text. When `dir` is `-1`, iteration happens from end to start. This will return lines and the breaks between them as separate strings.

`**[iterRange](#state.Text.iterRange)**([from](#state.Text.iterRange^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.Text.iterRange^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = this.length) → [TextIterator](#state.TextIterator)`

Iterate over a range of the text. When `from` > `to`, the iterator will run in reverse.

`**[iterLines](#state.Text.iterLines)**([from](#state.Text.iterLines^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.Text.iterLines^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [TextIterator](#state.TextIterator)`

Return a cursor that iterates over the given range of lines, _without_ returning the line breaks between, and yielding empty strings for empty lines.

When `from` and `to` are given, they should be 1-based line numbers.

`**[toString](#state.Text.toString)**() → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Return the document as a string, using newline characters to separate lines.

`**[toJSON](#state.Text.toJSON)**() → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

Convert the document to an array of lines (which can be deserialized again via [`Text.of`](#state.Text%5Eof)).

`**[children](#state.Text.children)**: readonly [Text](#state.Text)[] | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

If this is a branch node, `children` will hold the `Text` objects that it is made up of. For leaf nodes, this holds null.

`static **[of](#state.Text^of)**([text](#state.Text^of^text): readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]) → [Text](#state.Text)`

Create a `Text` instance for the given array of lines.

`static **[empty](#state.Text^empty)**: [Text](#state.Text)`

The empty document.

#### `class` [Line](#state.Line)

This type describes a line in the document. It is created on-demand when lines are [queried](#state.Text.lineAt).

`**[from](#state.Line.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The position of the start of the line.

`**[to](#state.Line.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The position at the end of the line (_before_ the line break, or at the end of document for the last line).

`**[number](#state.Line.number)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

This line's line number (1-based).

`**[text](#state.Line.text)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The line's content.

`**[length](#state.Line.length)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The length of the line (not including any line break after it).

#### `interface` [TextIterator](#state.TextIterator) `extends [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>` `extends [Iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_iterable_protocol)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

A text iterator iterates over a sequence of strings. When iterating over a [`Text`](#state.Text) document, result values will either be lines or line breaks.

`**[next](#state.TextIterator.next)**([skip](#state.TextIterator.next^skip)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [TextIterator](#state.TextIterator)`

Retrieve the next string. Optionally skip a given number of positions after the current position. Always returns the object itself.

`**[value](#state.TextIterator.value)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The current string. Will be the empty string when the cursor is at its end or `next` hasn't been called on it yet.

`**[done](#state.TextIterator.done)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the end of the iteration has been reached. You should probably check this right after calling `next`.

`**[lineBreak](#state.TextIterator.lineBreak)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the current string represents a line break.

#### Column Utilities

`**[countColumn](#state.countColumn)**(  [string](#state.countColumn^string): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [tabSize](#state.countColumn^tabSize): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.countColumn^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = string.length  ) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Count the column position at the given offset into the string, taking extending characters and tab size into account.

`**[findColumn](#state.findColumn)**(  [string](#state.findColumn^string): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [col](#state.findColumn^col): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [tabSize](#state.findColumn^tabSize): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [strict](#state.findColumn^strict)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  ) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Find the offset that corresponds to the given column position in a string, taking extending characters and tab size into account. By default, the string length is returned when it is too short to reach the column. Pass `strict` true to make it return -1 in that situation.

#### Code Points and Characters

If you support environments that don't yet have `String.fromCodePoint` and `codePointAt`, this package provides portable replacements for them.

`**[codePointAt](#state.codePointAt)**([str](#state.codePointAt^str): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [pos](#state.codePointAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Find the code point at the given position in a string (like the [`codePointAt`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/codePointAt) string method).

`**[fromCodePoint](#state.fromCodePoint)**([code](#state.fromCodePoint^code): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Given a Unicode codepoint, return the JavaScript string that respresents it (like [`String.fromCodePoint`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint)).

`**[codePointSize](#state.codePointSize)**([code](#state.codePointSize^code): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → 1 | 2`

The amount of positions a character takes up in a JavaScript string.

`**[findClusterBreak](#state.findClusterBreak)**(  [str](#state.findClusterBreak^str): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [pos](#state.findClusterBreak^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [forward](#state.findClusterBreak^forward)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = true,  [includeExtending](#state.findClusterBreak^includeExtending)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = true  ) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Returns a next grapheme cluster break _after_ (not equal to) `pos`, if `forward` is true, or before otherwise. Returns `pos` itself if no further cluster break is available in the string. Moves across surrogate pairs, extending characters (when `includeExtending` is true), characters joined with zero-width joiners, and flag emoji.

### Changes and Transactions

CodeMirror treats changes to the document as [objects](#state.ChangeSet), which are usually part of a [transaction](#state.Transaction).

This is how you'd make a change to a document (replacing “world” with “editor”) and create a new state with the updated document:

```javascript
let state = EditorState.create({doc: "hello world"})
let transaction = state.update({changes: {from: 6, to: 11, insert: "editor"}})
console.log(transaction.state.doc.toString()) // "hello editor"
```

#### `interface` [TransactionSpec](#state.TransactionSpec)

Describes a [transaction](#state.Transaction) when calling the [`EditorState.update`](#state.EditorState.update) method.

`**[changes](#state.TransactionSpec.changes)**⁠?: [ChangeSpec](#state.ChangeSpec)`

The changes to the document made by this transaction.

`**[selection](#state.TransactionSpec.selection)**⁠?: [EditorSelection](#state.EditorSelection) |  {anchor: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), head⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} |  [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)  `

When set, this transaction explicitly updates the selection. Offsets in this selection should refer to the document as it is _after_ the transaction.

`**[effects](#state.TransactionSpec.effects)**⁠?: [StateEffect](#state.StateEffect)<any> | readonly [StateEffect](#state.StateEffect)<any>[]`

Attach [state effects](#state.StateEffect) to this transaction. Again, when they contain positions and this same spec makes changes, those positions should refer to positions in the updated document.

`**[annotations](#state.TransactionSpec.annotations)**⁠?: [Annotation](#state.Annotation)<any> | readonly [Annotation](#state.Annotation)<any>[]`

Set [annotations](#state.Annotation) for this transaction.

`**[userEvent](#state.TransactionSpec.userEvent)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Shorthand for `annotations:` [`Transaction.userEvent`](#state.Transaction%5EuserEvent)`.of(...)`.

`**[scrollIntoView](#state.TransactionSpec.scrollIntoView)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When set to `true`, the transaction is marked as needing to scroll the current selection into view.

`**[filter](#state.TransactionSpec.filter)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, transactions can be modified by [change filters](#state.EditorState%5EchangeFilter) and [transaction filters](#state.EditorState%5EtransactionFilter). You can set this to `false` to disable that. This can be necessary for transactions that, for example, include annotations that must be kept consistent with their changes.

`**[sequential](#state.TransactionSpec.sequential)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Normally, when multiple specs are combined (for example by [`EditorState.update`](#state.EditorState.update)), the positions in `changes` are taken to refer to the document positions in the initial document. When a spec has `sequental` set to true, its positions will be taken to refer to the document created by the specs before it instead.

`type **[ChangeSpec](#state.ChangeSpec)** = {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), insert⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [Text](#state.Text)} |  [ChangeSet](#state.ChangeSet) |  readonly [ChangeSpec](#state.ChangeSpec)[]  `

This type is used as argument to [`EditorState.changes`](#state.EditorState.changes) and in the [`changes` field](#state.TransactionSpec.changes) of transaction specs to succinctly describe document changes. It may either be a plain object describing a change (a deletion, insertion, or replacement, depending on which fields are present), a [change set](#state.ChangeSet), or an array of change specs.

#### `class` [Transaction](#state.Transaction)

Changes to the editor state are grouped into transactions. Typically, a user action creates a single transaction, which may contain any number of document changes, may change the selection, or have other effects. Create a transaction by calling [`EditorState.update`](#state.EditorState.update), or immediately dispatch one by calling [`EditorView.dispatch`](#view.EditorView.dispatch).

`**[startState](#state.Transaction.startState)**: [EditorState](#state.EditorState)`

The state from which the transaction starts.

`**[changes](#state.Transaction.changes)**: [ChangeSet](#state.ChangeSet)`

The document changes made by this transaction.

`**[selection](#state.Transaction.selection)**: [EditorSelection](#state.EditorSelection) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

The selection set by this transaction, or undefined if it doesn't explicitly set a selection.

`**[effects](#state.Transaction.effects)**: readonly [StateEffect](#state.StateEffect)<any>[]`

The effects added to the transaction.

`**[scrollIntoView](#state.Transaction.scrollIntoView)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the selection should be scrolled into view after this transaction is dispatched.

`**[newDoc](#state.Transaction.newDoc)**: [Text](#state.Text)`

The new document produced by the transaction. Contrary to [`.state`](#state.Transaction.state)`.doc`, accessing this won't force the entire new state to be computed right away, so it is recommended that [transaction filters](#state.EditorState%5EtransactionFilter) use this getter when they need to look at the new document.

`**[newSelection](#state.Transaction.newSelection)**: [EditorSelection](#state.EditorSelection)`

The new selection produced by the transaction. If [`this.selection`](#state.Transaction.selection) is undefined, this will [map](#state.EditorSelection.map) the start state's current selection through the changes made by the transaction.

`**[state](#state.Transaction.state)**: [EditorState](#state.EditorState)`

The new state created by the transaction. Computed on demand (but retained for subsequent access), so it is recommended not to access it in [transaction filters](#state.EditorState%5EtransactionFilter) when possible.

`**[annotation](#state.Transaction.annotation)**<[T](#state.Transaction.annotation^T)>([type](#state.Transaction.annotation^type): [AnnotationType](#state.AnnotationType)<[T](#state.Transaction.annotation^T)>) → [T](#state.Transaction.annotation^T) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Get the value of the given annotation type, if any.

`**[docChanged](#state.Transaction.docChanged)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether the transaction changed the document.

`**[reconfigured](#state.Transaction.reconfigured)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether this transaction reconfigures the state (through a [configuration compartment](#state.Compartment) or with a top-level configuration [effect](#state.StateEffect%5Ereconfigure).

`**[isUserEvent](#state.Transaction.isUserEvent)**([event](#state.Transaction.isUserEvent^event): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns true if the transaction has a [user event](#state.Transaction%5EuserEvent) annotation that is equal to or more specific than `event`. For example, if the transaction has `"select.pointer"` as user event, `"select"` and `"select.pointer"` will match it.

`static **[time](#state.Transaction^time)**: [AnnotationType](#state.AnnotationType)<[number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)>`

Annotation used to store transaction timestamps. Automatically added to every transaction, holding `Date.now()`.

`static **[userEvent](#state.Transaction^userEvent)**: [AnnotationType](#state.AnnotationType)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

Annotation used to associate a transaction with a user interface event. Holds a string identifying the event, using a dot-separated format to support attaching more specific information. The events used by the core libraries are:

*   `"input"` when content is entered
    *   `"input.type"` for typed input
        *   `"input.type.compose"` for composition
    *   `"input.paste"` for pasted input
    *   `"input.drop"` when adding content with drag-and-drop
    *   `"input.complete"` when autocompleting
*   `"delete"` when the user deletes content
    *   `"delete.selection"` when deleting the selection
    *   `"delete.forward"` when deleting forward from the selection
    *   `"delete.backward"` when deleting backward from the selection
    *   `"delete.cut"` when cutting to the clipboard
*   `"move"` when content is moved
    *   `"move.drop"` when content is moved within the editor through drag-and-drop
*   `"select"` when explicitly changing the selection
    *   `"select.pointer"` when selecting with a mouse or other pointing device
*   `"undo"` and `"redo"` for history actions

Use [`isUserEvent`](#state.Transaction.isUserEvent) to check whether the annotation matches a given event.

`static **[addToHistory](#state.Transaction^addToHistory)**: [AnnotationType](#state.AnnotationType)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

Annotation indicating whether a transaction should be added to the undo history or not.

`static **[remote](#state.Transaction^remote)**: [AnnotationType](#state.AnnotationType)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

Annotation indicating (when present and true) that a transaction represents a change made by some other actor, not the user. This is used, for example, to tag other people's changes in collaborative editing.

#### `class` [ChangeDesc](#state.ChangeDesc)

A change description is a variant of [change set](#state.ChangeSet) that doesn't store the inserted text. As such, it can't be applied, but is cheaper to store and manipulate.

`**[length](#state.ChangeDesc.length)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The length of the document before the change.

`**[newLength](#state.ChangeDesc.newLength)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The length of the document after the change.

`**[empty](#state.ChangeDesc.empty)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

False when there are actual changes in this set.

`**[iterGaps](#state.ChangeDesc.iterGaps)**([f](#state.ChangeDesc.iterGaps^f): fn([posA](#state.ChangeDesc.iterGaps^f^posA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [posB](#state.ChangeDesc.iterGaps^f^posB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [length](#state.ChangeDesc.iterGaps^f^length): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)))`

Iterate over the unchanged parts left by these changes. `posA` provides the position of the range in the old document, `posB` the new position in the changed document.

`**[iterChangedRanges](#state.ChangeDesc.iterChangedRanges)**(  [f](#state.ChangeDesc.iterChangedRanges^f): fn([fromA](#state.ChangeDesc.iterChangedRanges^f^fromA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [toA](#state.ChangeDesc.iterChangedRanges^f^toA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [fromB](#state.ChangeDesc.iterChangedRanges^f^fromB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [toB](#state.ChangeDesc.iterChangedRanges^f^toB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)),  [individual](#state.ChangeDesc.iterChangedRanges^individual)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false  )`

Iterate over the ranges changed by these changes. (See [`ChangeSet.iterChanges`](#state.ChangeSet.iterChanges) for a variant that also provides you with the inserted text.) `fromA`/`toA` provides the extent of the change in the starting document, `fromB`/`toB` the extent of the replacement in the changed document.

When `individual` is true, adjacent changes (which are kept separate for [position mapping](#state.ChangeDesc.mapPos)) are reported separately.

`**[invertedDesc](#state.ChangeDesc.invertedDesc)**: [ChangeDesc](#state.ChangeDesc)`

Get a description of the inverted form of these changes.

`**[composeDesc](#state.ChangeDesc.composeDesc)**([other](#state.ChangeDesc.composeDesc^other): [ChangeDesc](#state.ChangeDesc)) → [ChangeDesc](#state.ChangeDesc)`

Compute the combined effect of applying another set of changes after this one. The length of the document after this set should match the length before `other`.

`**[mapDesc](#state.ChangeDesc.mapDesc)**([other](#state.ChangeDesc.mapDesc^other): [ChangeDesc](#state.ChangeDesc), [before](#state.ChangeDesc.mapDesc^before)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false) → [ChangeDesc](#state.ChangeDesc)`

Map this description, which should start with the same document as `other`, over another set of changes, so that it can be applied after it. When `before` is true, map as if the changes in `this` happened before the ones in `other`.

`**[mapPos](#state.ChangeDesc.mapPos)**([pos](#state.ChangeDesc.mapPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [assoc](#state.ChangeDesc.mapPos^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[mapPos](#state.ChangeDesc.mapPos)**([pos](#state.ChangeDesc.mapPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [assoc](#state.ChangeDesc.mapPos^assoc): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [mode](#state.ChangeDesc.mapPos^mode): [MapMode](#state.MapMode)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Map a given position through these changes, to produce a position pointing into the new document.

`assoc` indicates which side the position should be associated with. When it is negative, the mapping will try to keep the position close to the character before it (if any), and will move it before insertions at that point or replacements across that point. When it is zero or positive, the position is associated with the character after it, and will be moved forward for

`mode` determines whether deletions should be [reported](#state.MapMode). It defaults to [`MapMode.Simple`](#state.MapMode.Simple) (don't report deletions).

`**[touchesRange](#state.ChangeDesc.touchesRange)**([from](#state.ChangeDesc.touchesRange^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.ChangeDesc.touchesRange^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = from) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | "cover"`

Check whether these changes touch a given range. When one of the changes entirely covers the range, the string `"cover"` is returned.

`**[toJSON](#state.ChangeDesc.toJSON)**() → readonly [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)[]`

Serialize this change desc to a JSON-representable value.

`static **[fromJSON](#state.ChangeDesc^fromJSON)**([json](#state.ChangeDesc^fromJSON^json): any) → [ChangeDesc](#state.ChangeDesc)`

Create a change desc from its JSON representation (as produced by [`toJSON`](#state.ChangeDesc.toJSON).

`enum **[MapMode](#state.MapMode)**`

Distinguishes different ways in which positions can be mapped.

`**[Simple](#state.MapMode.Simple)**`

Map a position to a valid new position, even when its context was deleted.

`**[TrackDel](#state.MapMode.TrackDel)**`

Return null if deletion happens across the position.

`**[TrackBefore](#state.MapMode.TrackBefore)**`

Return null if the character _before_ the position is deleted.

`**[TrackAfter](#state.MapMode.TrackAfter)**`

Return null if the character _after_ the position is deleted.

#### `class` [ChangeSet](#state.ChangeSet) `extends [ChangeDesc](#state.ChangeDesc)`

A change set represents a group of modifications to a document. It stores the document length, and can only be applied to documents with exactly that length.

`**[apply](#state.ChangeSet.apply)**([doc](#state.ChangeSet.apply^doc): [Text](#state.Text)) → [Text](#state.Text)`

Apply the changes to a document, returning the modified document.

`**[invert](#state.ChangeSet.invert)**([doc](#state.ChangeSet.invert^doc): [Text](#state.Text)) → [ChangeSet](#state.ChangeSet)`

Given the document as it existed _before_ the changes, return a change set that represents the inverse of this set, which could be used to go from the document created by the changes back to the document as it existed before the changes.

`**[compose](#state.ChangeSet.compose)**([other](#state.ChangeSet.compose^other): [ChangeSet](#state.ChangeSet)) → [ChangeSet](#state.ChangeSet)`

Combine two subsequent change sets into a single set. `other` must start in the document produced by `this`. If `this` goes `docA` → `docB` and `other` represents `docB` → `docC`, the returned value will represent the change `docA` → `docC`.

`**[map](#state.ChangeSet.map)**([other](#state.ChangeSet.map^other): [ChangeDesc](#state.ChangeDesc), [before](#state.ChangeSet.map^before)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false) → [ChangeSet](#state.ChangeSet)`

Given another change set starting in the same document, maps this change set over the other, producing a new change set that can be applied to the document produced by applying `other`. When `before` is `true`, order changes as if `this` comes before `other`, otherwise (the default) treat `other` as coming first.

Given two changes `A` and `B`, `A.compose(B.map(A))` and `B.compose(A.map(B, true))` will produce the same document. This provides a basic form of [operational transformation](https://en.wikipedia.org/wiki/Operational_transformation), and can be used for collaborative editing.

`**[iterChanges](#state.ChangeSet.iterChanges)**(  [f](#state.ChangeSet.iterChanges^f): fn(  [fromA](#state.ChangeSet.iterChanges^f^fromA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [toA](#state.ChangeSet.iterChanges^f^toA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [fromB](#state.ChangeSet.iterChanges^f^fromB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [toB](#state.ChangeSet.iterChanges^f^toB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [inserted](#state.ChangeSet.iterChanges^f^inserted): [Text](#state.Text)  ),  [individual](#state.ChangeSet.iterChanges^individual)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false  )`

Iterate over the changed ranges in the document, calling `f` for each, with the range in the original document (`fromA`\-`toA`) and the range that replaces it in the new document (`fromB`\-`toB`).

When `individual` is true, adjacent changes are reported separately.

`**[desc](#state.ChangeSet.desc)**: [ChangeDesc](#state.ChangeDesc)`

Get a [change description](#state.ChangeDesc) for this change set.

`**[toJSON](#state.ChangeSet.toJSON)**() → any`

Serialize this change set to a JSON-representable value.

`static **[of](#state.ChangeSet^of)**([changes](#state.ChangeSet^of^changes): [ChangeSpec](#state.ChangeSpec), [length](#state.ChangeSet^of^length): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [lineSep](#state.ChangeSet^of^lineSep)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [ChangeSet](#state.ChangeSet)`

Create a change set for the given changes, for a document of the given length, using `lineSep` as line separator.

`static **[empty](#state.ChangeSet^empty)**([length](#state.ChangeSet^empty^length): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [ChangeSet](#state.ChangeSet)`

Create an empty changeset of the given length.

`static **[fromJSON](#state.ChangeSet^fromJSON)**([json](#state.ChangeSet^fromJSON^json): any) → [ChangeSet](#state.ChangeSet)`

Create a changeset from its JSON representation (as produced by [`toJSON`](#state.ChangeSet.toJSON).

#### `class` [Annotation](#state.Annotation)`<[T](#state.Annotation^T)>`

Annotations are tagged values that are used to add metadata to transactions in an extensible way. They should be used to model things that effect the entire transaction (such as its [time stamp](#state.Transaction%5Etime) or information about its [origin](#state.Transaction%5EuserEvent)). For effects that happen _alongside_ the other changes made by the transaction, [state effects](#state.StateEffect) are more appropriate.

`**[type](#state.Annotation.type)**: [AnnotationType](#state.AnnotationType)<[T](#state.Annotation^T)>`

The annotation type.

`**[value](#state.Annotation.value)**: [T](#state.Annotation^T)`

The value of this annotation.

`static **[define](#state.Annotation^define)**<[T](#state.Annotation^define^T)>() → [AnnotationType](#state.AnnotationType)<[T](#state.Annotation^define^T)>`

Define a new type of annotation.

#### `class` [AnnotationType](#state.AnnotationType)`<[T](#state.AnnotationType^T)>`

Marker that identifies a type of [annotation](#state.Annotation).

`**[of](#state.AnnotationType.of)**([value](#state.AnnotationType.of^value): [T](#state.AnnotationType^T)) → [Annotation](#state.Annotation)<[T](#state.AnnotationType^T)>`

Create an instance of this annotation.

#### `class` [StateEffect](#state.StateEffect)`<[Value](#state.StateEffect^Value)>`

State effects can be used to represent additional effects associated with a [transaction](#state.Transaction.effects). They are often useful to model changes to custom [state fields](#state.StateField), when those changes aren't implicit in document or selection changes.

`**[value](#state.StateEffect.value)**: [Value](#state.StateEffect^Value)`

The value of this effect.

`**[map](#state.StateEffect.map)**([mapping](#state.StateEffect.map^mapping): [ChangeDesc](#state.ChangeDesc)) → [StateEffect](#state.StateEffect)<[Value](#state.StateEffect^Value)> | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Map this effect through a position mapping. Will return `undefined` when that ends up deleting the effect.

`**[is](#state.StateEffect.is)**<[T](#state.StateEffect.is^T)>([type](#state.StateEffect.is^type): [StateEffectType](#state.StateEffectType)<[T](#state.StateEffect.is^T)>) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Tells you whether this effect object is of a given [type](#state.StateEffectType).

`static **[define](#state.StateEffect^define)**<[Value](#state.StateEffect^define^Value) = null>([spec](#state.StateEffect^define^spec)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [StateEffectType](#state.StateEffectType)<[Value](#state.StateEffect^define^Value)>`

Define a new effect type. The type parameter indicates the type of values that his effect holds. It should be a type that doesn't include `undefined`, since that is used in [mapping](#state.StateEffect.map) to indicate that an effect is removed.

`**[spec](#state.StateEffect^define^spec)**`

`**[map](#state.StateEffect^define^spec.map)**⁠?: fn([value](#state.StateEffect^define^spec.map^value): [Value](#state.StateEffect^define^Value), [mapping](#state.StateEffect^define^spec.map^mapping): [ChangeDesc](#state.ChangeDesc)) → [Value](#state.StateEffect^define^Value) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Provides a way to map an effect like this through a position mapping. When not given, the effects will simply not be mapped. When the function returns `undefined`, that means the mapping deletes the effect.

`static **[mapEffects](#state.StateEffect^mapEffects)**(  [effects](#state.StateEffect^mapEffects^effects): readonly [StateEffect](#state.StateEffect)<any>[],  [mapping](#state.StateEffect^mapEffects^mapping): [ChangeDesc](#state.ChangeDesc)  ) → readonly [StateEffect](#state.StateEffect)<any>[]`

Map an array of effects through a change set.

`static **[reconfigure](#state.StateEffect^reconfigure)**: [StateEffectType](#state.StateEffectType)<[Extension](#state.Extension)>`

This effect can be used to reconfigure the root extensions of the editor. Doing this will discard any extensions [appended](#state.StateEffect%5EappendConfig), but does not reset the content of [reconfigured](#state.Compartment.reconfigure) compartments.

`static **[appendConfig](#state.StateEffect^appendConfig)**: [StateEffectType](#state.StateEffectType)<[Extension](#state.Extension)>`

Append extensions to the top-level configuration of the editor.

#### `class` [StateEffectType](#state.StateEffectType)`<[Value](#state.StateEffectType^Value)>`

Representation of a type of state effect. Defined with [`StateEffect.define`](#state.StateEffect%5Edefine).

`**[of](#state.StateEffectType.of)**([value](#state.StateEffectType.of^value): [Value](#state.StateEffectType^Value)) → [StateEffect](#state.StateEffect)<[Value](#state.StateEffectType^Value)>`

Create a [state effect](#state.StateEffect) instance of this type.

### Extending Editor State

The following are some types and mechanisms used when writing extensions for the editor state.

`type **[StateCommand](#state.StateCommand)** = fn(  [target](#state.StateCommand^target): {state: [EditorState](#state.EditorState), dispatch: fn([transaction](#state.StateCommand^target.dispatch^transaction): [Transaction](#state.Transaction))}  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Subtype of [`Command`](#view.Command) that doesn't require access to the actual editor view. Mostly useful to define commands that can be run and tested outside of a browser environment.

`type **[Extension](#state.Extension)** = {extension: [Extension](#state.Extension)} | readonly [Extension](#state.Extension)[]`

Extension values can be [provided](#state.EditorStateConfig.extensions) when creating a state to attach various kinds of configuration and behavior information. They can either be built-in extension-providing objects, such as [state fields](#state.StateField) or [facet providers](#state.Facet.of), or objects with an extension in its `extension` property. Extensions can be nested in arrays arbitrarily deep—they will be flattened when processed.

#### `class` [StateField](#state.StateField)`<[Value](#state.StateField^Value)>`

Fields can store additional information in an editor state, and keep it in sync with the rest of the state.

`**[init](#state.StateField.init)**([create](#state.StateField.init^create): fn([state](#state.StateField.init^create^state): [EditorState](#state.EditorState)) → [Value](#state.StateField^Value)) → [Extension](#state.Extension)`

Returns an extension that enables this field and overrides the way it is initialized. Can be useful when you need to provide a non-default starting value for the field.

`**[extension](#state.StateField.extension)**: [Extension](#state.Extension)`

State field instances can be used as [`Extension`](#state.Extension) values to enable the field in a given state.

`static **[define](#state.StateField^define)**<[Value](#state.StateField^define^Value)>([config](#state.StateField^define^config): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [StateField](#state.StateField)<[Value](#state.StateField^define^Value)>`

Define a state field.

`**[config](#state.StateField^define^config)**`

`**[create](#state.StateField^define^config.create)**([state](#state.StateField^define^config.create^state): [EditorState](#state.EditorState)) → [Value](#state.StateField^define^Value)`

Creates the initial value for the field when a state is created.

`**[update](#state.StateField^define^config.update)**([value](#state.StateField^define^config.update^value): [Value](#state.StateField^define^Value), [transaction](#state.StateField^define^config.update^transaction): [Transaction](#state.Transaction)) → [Value](#state.StateField^define^Value)`

Compute a new value from the field's previous value and a [transaction](#state.Transaction).

`**[compare](#state.StateField^define^config.compare)**⁠?: fn([a](#state.StateField^define^config.compare^a): [Value](#state.StateField^define^Value), [b](#state.StateField^define^config.compare^b): [Value](#state.StateField^define^Value)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare two values of the field, returning `true` when they are the same. This is used to avoid recomputing facets that depend on the field when its value did not change. Defaults to using `===`.

`**[provide](#state.StateField^define^config.provide)**⁠?: fn([field](#state.StateField^define^config.provide^field): [StateField](#state.StateField)<[Value](#state.StateField^define^Value)>) → [Extension](#state.Extension)`

Provide extensions based on this field. The given function will be called once with the initialized field. It will usually want to call some facet's [`from`](#state.Facet.from) method to create facet inputs from this field, but can also return other extensions that should be enabled when the field is present in a configuration.

`**[toJSON](#state.StateField^define^config.toJSON)**⁠?: fn([value](#state.StateField^define^config.toJSON^value): [Value](#state.StateField^define^Value), [state](#state.StateField^define^config.toJSON^state): [EditorState](#state.EditorState)) → any`

A function used to serialize this field's content to JSON. Only necessary when this field is included in the argument to [`EditorState.toJSON`](#state.EditorState.toJSON).

`**[fromJSON](#state.StateField^define^config.fromJSON)**⁠?: fn([json](#state.StateField^define^config.fromJSON^json): any, [state](#state.StateField^define^config.fromJSON^state): [EditorState](#state.EditorState)) → [Value](#state.StateField^define^Value)`

A function that deserializes the JSON representation of this field's content.

#### `class` [Facet](#state.Facet)`<[Input](#state.Facet^Input), [Output](#state.Facet^Output) = readonly Input[]>` `implements [FacetReader](#state.FacetReader)<[Output](#state.Facet^Output)>`

A facet is a labeled value that is associated with an editor state. It takes inputs from any number of extensions, and combines those into a single output value.

Examples of uses of facets are the [tab size](#state.EditorState%5EtabSize), [editor attributes](#view.EditorView%5EeditorAttributes), and [update listeners](#view.EditorView%5EupdateListener).

Note that `Facet` instances can be used anywhere where [`FacetReader`](#state.FacetReader) is expected.

`**[reader](#state.Facet.reader)**: [FacetReader](#state.FacetReader)<[Output](#state.Facet^Output)>`

Returns a facet reader for this facet, which can be used to [read](#state.EditorState.facet) it but not to define values for it.

`**[of](#state.Facet.of)**([value](#state.Facet.of^value): [Input](#state.Facet^Input)) → [Extension](#state.Extension)`

Returns an extension that adds the given value to this facet.

`**[compute](#state.Facet.compute)**(  [deps](#state.Facet.compute^deps): readonly ([StateField](#state.StateField)<any> | "doc" | "selection" | [FacetReader](#state.FacetReader)<any>)[],  [get](#state.Facet.compute^get): fn([state](#state.Facet.compute^get^state): [EditorState](#state.EditorState)) → [Input](#state.Facet^Input)  ) → [Extension](#state.Extension)`

Create an extension that computes a value for the facet from a state. You must take care to declare the parts of the state that this value depends on, since your function is only called again for a new state when one of those parts changed.

In cases where your value depends only on a single field, you'll want to use the [`from`](#state.Facet.from) method instead.

`**[computeN](#state.Facet.computeN)**(  [deps](#state.Facet.computeN^deps): readonly ([StateField](#state.StateField)<any> | "doc" | "selection" | [FacetReader](#state.FacetReader)<any>)[],  [get](#state.Facet.computeN^get): fn([state](#state.Facet.computeN^get^state): [EditorState](#state.EditorState)) → readonly [Input](#state.Facet^Input)[]  ) → [Extension](#state.Extension)`

Create an extension that computes zero or more values for this facet from a state.

`**[from](#state.Facet.from)**<[T](#state.Facet.from^T) extends [Input](#state.Facet^Input)>([field](#state.Facet.from^field): [StateField](#state.StateField)<[T](#state.Facet.from^T)>) → [Extension](#state.Extension)`

`**[from](#state.Facet.from)**<[T](#state.Facet.from^T)>([field](#state.Facet.from^field): [StateField](#state.StateField)<[T](#state.Facet.from^T)>, [get](#state.Facet.from^get): fn([value](#state.Facet.from^get^value): [T](#state.Facet.from^T)) → [Input](#state.Facet^Input)) → [Extension](#state.Extension)`

Shorthand method for registering a facet source with a state field as input. If the field's type corresponds to this facet's input type, the getter function can be omitted. If given, it will be used to retrieve the input from the field value.

`static **[define](#state.Facet^define)**<[Input](#state.Facet^define^Input), [Output](#state.Facet^define^Output) = readonly Input[]>([config](#state.Facet^define^config)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [Facet](#state.Facet)<[Input](#state.Facet^define^Input), [Output](#state.Facet^define^Output)>`

Define a new facet.

`**[config](#state.Facet^define^config)**`

`**[combine](#state.Facet^define^config.combine)**⁠?: fn([value](#state.Facet^define^config.combine^value): readonly [Input](#state.Facet^define^Input)[]) → [Output](#state.Facet^define^Output)`

How to combine the input values into a single output value. When not given, the array of input values becomes the output. This function will immediately be called on creating the facet, with an empty array, to compute the facet's default value when no inputs are present.

`**[compare](#state.Facet^define^config.compare)**⁠?: fn([a](#state.Facet^define^config.compare^a): [Output](#state.Facet^define^Output), [b](#state.Facet^define^config.compare^b): [Output](#state.Facet^define^Output)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

How to compare output values to determine whether the value of the facet changed. Defaults to comparing by `===` or, if no `combine` function was given, comparing each element of the array with `===`.

`**[compareInput](#state.Facet^define^config.compareInput)**⁠?: fn([a](#state.Facet^define^config.compareInput^a): [Input](#state.Facet^define^Input), [b](#state.Facet^define^config.compareInput^b): [Input](#state.Facet^define^Input)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

How to compare input values to avoid recomputing the output value when no inputs changed. Defaults to comparing with `===`.

`**[static](#state.Facet^define^config.static)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Forbids dynamic inputs to this facet.

`**[enables](#state.Facet^define^config.enables)**⁠?: [Extension](#state.Extension) | fn([self](#state.Facet^define^config.enables^self): [Facet](#state.Facet)<[Input](#state.Facet^define^Input), [Output](#state.Facet^define^Output)>) → [Extension](#state.Extension)`

If given, these extension(s) (or the result of calling the given function with the facet) will be added to any state where this facet is provided. (Note that, while a facet's default value can be read from a state even if the facet wasn't present in the state at all, these extensions won't be added in that situation.)

#### `type` [FacetReader](#state.FacetReader)`<[Output](#state.FacetReader^Output)>`

A facet reader can be used to fetch the value of a facet, through [`EditorState.facet`](#state.EditorState.facet) or as a dependency in [`Facet.compute`](#state.Facet.compute), but not to define new values for the facet.

`**[tag](#state.FacetReader.tag)**: [Output](#state.FacetReader^Output)`

Dummy tag that makes sure TypeScript doesn't consider all object types as conforming to this type. Not actually present on the object.

`**[Prec](#state.Prec)**: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)`

By default extensions are registered in the order they are found in the flattened form of nested array that was provided. Individual extension values can be assigned a precedence to override this. Extensions that do not have a precedence set get the precedence of the nearest parent with a precedence, or [`default`](#state.Prec.default) if there is no such parent. The final ordering of extensions is determined by first sorting by precedence and then by order within each precedence.

`**[highest](#state.Prec.highest)**([ext](#state.Prec.highest^ext): [Extension](#state.Extension)) → [Extension](#state.Extension)`

The highest precedence level, for extensions that should end up near the start of the precedence ordering.

`**[high](#state.Prec.high)**([ext](#state.Prec.high^ext): [Extension](#state.Extension)) → [Extension](#state.Extension)`

A higher-than-default precedence, for extensions that should come before those with default precedence.

`**[default](#state.Prec.default)**([ext](#state.Prec.default^ext): [Extension](#state.Extension)) → [Extension](#state.Extension)`

The default precedence, which is also used for extensions without an explicit precedence.

`**[low](#state.Prec.low)**([ext](#state.Prec.low^ext): [Extension](#state.Extension)) → [Extension](#state.Extension)`

A lower-than-default precedence.

`**[lowest](#state.Prec.lowest)**([ext](#state.Prec.lowest^ext): [Extension](#state.Extension)) → [Extension](#state.Extension)`

The lowest precedence level. Meant for things that should end up near the end of the extension order.

#### `class` [Compartment](#state.Compartment)

Extension compartments can be used to make a configuration dynamic. By [wrapping](#state.Compartment.of) part of your configuration in a compartment, you can later [replace](#state.Compartment.reconfigure) that part through a transaction.

`**[of](#state.Compartment.of)**([ext](#state.Compartment.of^ext): [Extension](#state.Extension)) → [Extension](#state.Extension)`

Create an instance of this compartment to add to your [state configuration](#state.EditorStateConfig.extensions).

`**[reconfigure](#state.Compartment.reconfigure)**([content](#state.Compartment.reconfigure^content): [Extension](#state.Extension)) → [StateEffect](#state.StateEffect)<unknown>`

Create an [effect](#state.TransactionSpec.effects) that reconfigures this compartment.

`**[get](#state.Compartment.get)**([state](#state.Compartment.get^state): [EditorState](#state.EditorState)) → [Extension](#state.Extension) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Get the current content of the compartment in the state, or `undefined` if it isn't present.

### Range Sets

Range sets provide a data structure that can hold a collection of tagged, possibly overlapping [ranges](#state.Range) in such a way that they can efficiently be [mapped](#state.RangeSet.map) though document changes. They are used for storing things like [decorations](#view.Decoration) or [gutter markers](#view.GutterMarker).

#### `abstract class` [RangeValue](#state.RangeValue)

Each range is associated with a value, which must inherit from this class.

`**[eq](#state.RangeValue.eq)**([other](#state.RangeValue.eq^other): [RangeValue](#state.RangeValue)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this value with another value. Used when comparing rangesets. The default implementation compares by identity. Unless you are only creating a fixed number of unique instances of your value type, it is a good idea to implement this properly.

`**[startSide](#state.RangeValue.startSide)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The bias value at the start of the range. Determines how the range is positioned relative to other ranges starting at this position. Defaults to 0.

`**[endSide](#state.RangeValue.endSide)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The bias value at the end of the range. Defaults to 0.

`**[mapMode](#state.RangeValue.mapMode)**: [MapMode](#state.MapMode)`

The mode with which the location of the range should be mapped when its `from` and `to` are the same, to decide whether a change deletes the range. Defaults to `MapMode.TrackDel`.

`**[point](#state.RangeValue.point)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Determines whether this value marks a point range. Regular ranges affect the part of the document they cover, and are meaningless when empty. Point ranges have a meaning on their own. When non-empty, a point range is treated as atomic and shadows any ranges contained in it.

`**[range](#state.RangeValue.range)**([from](#state.RangeValue.range^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.RangeValue.range^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = from) → [Range](#state.Range)<[RangeValue](#state.RangeValue)>`

Create a [range](#state.Range) with this value.

#### `class` [Range](#state.Range)`<[T](#state.Range^T) extends [RangeValue](#state.RangeValue)>`

A range associates a value with a range of positions.

`**[from](#state.Range.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The range's start position.

`**[to](#state.Range.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Its end position.

`**[value](#state.Range.value)**: [T](#state.Range^T)`

The value associated with this range.

#### `class` [RangeSet](#state.RangeSet)`<[T](#state.RangeSet^T) extends [RangeValue](#state.RangeValue)>`

A range set stores a collection of [ranges](#state.Range) in a way that makes them efficient to [map](#state.RangeSet.map) and [update](#state.RangeSet.update). This is an immutable data structure.

`**[size](#state.RangeSet.size)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The number of ranges in the set.

`**[update](#state.RangeSet.update)**<[U](#state.RangeSet.update^U) extends [T](#state.RangeSet^T)>([updateSpec](#state.RangeSet.update^updateSpec): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [RangeSet](#state.RangeSet)<[T](#state.RangeSet^T)>`

Update the range set, optionally adding new ranges or filtering out existing ones.

(Note: The type parameter is just there as a kludge to work around TypeScript variance issues that prevented `RangeSet<X>` from being a subtype of `RangeSet<Y>` when `X` is a subtype of `Y`.)

`**[updateSpec](#state.RangeSet.update^updateSpec)**`

`**[add](#state.RangeSet.update^updateSpec.add)**⁠?: readonly [Range](#state.Range)<[U](#state.RangeSet.update^U)>[]`

An array of ranges to add. If given, this should be sorted by `from` position and `startSide` unless [`sort`](#state.RangeSet.update%5EupdateSpec.sort) is given as `true`.

`**[sort](#state.RangeSet.update^updateSpec.sort)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether the library should sort the ranges in `add`. Defaults to `false`.

`**[filter](#state.RangeSet.update^updateSpec.filter)**⁠?: fn([from](#state.RangeSet.update^updateSpec.filter^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.RangeSet.update^updateSpec.filter^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [value](#state.RangeSet.update^updateSpec.filter^value): [U](#state.RangeSet.update^U)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Filter the ranges already in the set. Only those for which this function returns `true` are kept.

`**[filterFrom](#state.RangeSet.update^updateSpec.filterFrom)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Can be used to limit the range on which the filter is applied. Filtering only a small range, as opposed to the entire set, can make updates cheaper.

`**[filterTo](#state.RangeSet.update^updateSpec.filterTo)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end position to apply the filter to.

`**[map](#state.RangeSet.map)**([changes](#state.RangeSet.map^changes): [ChangeDesc](#state.ChangeDesc)) → [RangeSet](#state.RangeSet)<[T](#state.RangeSet^T)>`

Map this range set through a set of changes, return the new set.

`**[between](#state.RangeSet.between)**(  [from](#state.RangeSet.between^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.RangeSet.between^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [f](#state.RangeSet.between^f): fn([from](#state.RangeSet.between^f^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.RangeSet.between^f^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [value](#state.RangeSet.between^f^value): [T](#state.RangeSet^T)) → [false](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)  )`

Iterate over the ranges that touch the region `from` to `to`, calling `f` for each. There is no guarantee that the ranges will be reported in any specific order. When the callback returns `false`, iteration stops.

`**[iter](#state.RangeSet.iter)**([from](#state.RangeSet.iter^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0) → [RangeCursor](#state.RangeCursor)<[T](#state.RangeSet^T)>`

Iterate over the ranges in this set, in order, including all ranges that end at or after `from`.

`static **[iter](#state.RangeSet^iter)**<[T](#state.RangeSet^iter^T) extends [RangeValue](#state.RangeValue)>([sets](#state.RangeSet^iter^sets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^iter^T)>[], [from](#state.RangeSet^iter^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0) → [RangeCursor](#state.RangeCursor)<[T](#state.RangeSet^iter^T)>`

Iterate over the ranges in a collection of sets, in order, starting from `from`.

`static **[compare](#state.RangeSet^compare)**<[T](#state.RangeSet^compare^T) extends [RangeValue](#state.RangeValue)>(  [oldSets](#state.RangeSet^compare^oldSets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^compare^T)>[],  [newSets](#state.RangeSet^compare^newSets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^compare^T)>[],  textDiff: [ChangeDesc](#state.ChangeDesc),  [comparator](#state.RangeSet^compare^comparator): [RangeComparator](#state.RangeComparator)<[T](#state.RangeSet^compare^T)>,  minPointSize⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = -1  )`

Iterate over two groups of sets, calling methods on `comparator` to notify it of possible differences.

`**[textDiff](#state.RangeSet^compare^textDiff)**`

This indicates how the underlying data changed between these ranges, and is needed to synchronize the iteration.

`**[minPointSize](#state.RangeSet^compare^minPointSize)**`

Can be used to ignore all non-point ranges, and points below the given size. When -1, all ranges are compared.

`static **[eq](#state.RangeSet^eq)**<[T](#state.RangeSet^eq^T) extends [RangeValue](#state.RangeValue)>(  [oldSets](#state.RangeSet^eq^oldSets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^eq^T)>[],  [newSets](#state.RangeSet^eq^newSets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^eq^T)>[],  [from](#state.RangeSet^eq^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0,  [to](#state.RangeSet^eq^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare the contents of two groups of range sets, returning true if they are equivalent in the given range.

`static **[spans](#state.RangeSet^spans)**<[T](#state.RangeSet^spans^T) extends [RangeValue](#state.RangeValue)>(  [sets](#state.RangeSet^spans^sets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^spans^T)>[],  [from](#state.RangeSet^spans^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.RangeSet^spans^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [iterator](#state.RangeSet^spans^iterator): [SpanIterator](#state.SpanIterator)<[T](#state.RangeSet^spans^T)>,  minPointSize⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = -1  ) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Iterate over a group of range sets at the same time, notifying the iterator about the ranges covering every given piece of content. Returns the open count (see [`SpanIterator.span`](#state.SpanIterator.span)) at the end of the iteration.

`**[minPointSize](#state.RangeSet^spans^minPointSize)**`

When given and greater than -1, only points of at least this size are taken into account.

`static **[of](#state.RangeSet^of)**<[T](#state.RangeSet^of^T) extends [RangeValue](#state.RangeValue)>(  [ranges](#state.RangeSet^of^ranges): readonly [Range](#state.Range)<[T](#state.RangeSet^of^T)>[] | [Range](#state.Range)<[T](#state.RangeSet^of^T)>,  [sort](#state.RangeSet^of^sort)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false  ) → [RangeSet](#state.RangeSet)<[T](#state.RangeSet^of^T)>`

Create a range set for the given range or array of ranges. By default, this expects the ranges to be _sorted_ (by start position and, if two start at the same position, `value.startSide`). You can pass `true` as second argument to cause the method to sort them.

`static **[join](#state.RangeSet^join)**<[T](#state.RangeSet^join^T) extends [RangeValue](#state.RangeValue)>([sets](#state.RangeSet^join^sets): readonly [RangeSet](#state.RangeSet)<[T](#state.RangeSet^join^T)>[]) → [RangeSet](#state.RangeSet)<[T](#state.RangeSet^join^T)>`

Join an array of range sets into a single set.

`static **[empty](#state.RangeSet^empty)**: [RangeSet](#state.RangeSet)<any>`

The empty set of ranges.

#### `interface` [RangeCursor](#state.RangeCursor)`<[T](#state.RangeCursor^T)>`

A range cursor is an object that moves to the next range every time you call `next` on it. Note that, unlike ES6 iterators, these start out pointing at the first element, so you should call `next` only after reading the first range (if any).

`**[next](#state.RangeCursor.next)**()`

Move the iterator forward.

`**[goto](#state.RangeCursor.goto)**([pos](#state.RangeCursor.goto^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

Jump the cursor to the given position.

`**[value](#state.RangeCursor.value)**: [T](#state.RangeCursor^T) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

The next range's value. Holds `null` when the cursor has reached its end.

`**[from](#state.RangeCursor.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The next range's start position.

`**[to](#state.RangeCursor.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The next end position.

`**[rank](#state.RangeCursor.rank)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The position of the set that this range comes from in the array of sets being iterated over.

#### `class` [RangeSetBuilder](#state.RangeSetBuilder)`<[T](#state.RangeSetBuilder^T) extends [RangeValue](#state.RangeValue)>`

A range set builder is a data structure that helps build up a [range set](#state.RangeSet) directly, without first allocating an array of [`Range`](#state.Range) objects.

`new **[RangeSetBuilder](#state.RangeSetBuilder.constructor)**()`

Create an empty builder.

`**[add](#state.RangeSetBuilder.add)**([from](#state.RangeSetBuilder.add^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#state.RangeSetBuilder.add^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [value](#state.RangeSetBuilder.add^value): [T](#state.RangeSetBuilder^T))`

Add a range. Ranges should be added in sorted (by `from` and `value.startSide`) order.

`**[finish](#state.RangeSetBuilder.finish)**() → [RangeSet](#state.RangeSet)<[T](#state.RangeSetBuilder^T)>`

Finish the range set. Returns the new set. The builder can't be used anymore after this has been called.

#### `interface` [RangeComparator](#state.RangeComparator)`<[T](#state.RangeComparator^T) extends [RangeValue](#state.RangeValue)>`

Collection of methods used when comparing range sets.

`**[compareRange](#state.RangeComparator.compareRange)**(  [from](#state.RangeComparator.compareRange^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.RangeComparator.compareRange^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [activeA](#state.RangeComparator.compareRange^activeA): [T](#state.RangeComparator^T)[],  [activeB](#state.RangeComparator.compareRange^activeB): [T](#state.RangeComparator^T)[]  )`

Notifies the comparator that a range (in positions in the new document) has the given sets of values associated with it, which are different in the old (A) and new (B) sets.

`**[comparePoint](#state.RangeComparator.comparePoint)**(  [from](#state.RangeComparator.comparePoint^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.RangeComparator.comparePoint^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [pointA](#state.RangeComparator.comparePoint^pointA): [T](#state.RangeComparator^T) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null),  [pointB](#state.RangeComparator.comparePoint^pointB): [T](#state.RangeComparator^T) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  )`

Notification for a changed (or inserted, or deleted) point range.

`**[boundChange](#state.RangeComparator.boundChange)**⁠?: fn([pos](#state.RangeComparator.boundChange^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

Notification for a changed boundary between ranges. For example, if the same span is covered by two partial ranges before and one bigger range after, this is called at the point where the ranges used to be split.

#### `interface` [SpanIterator](#state.SpanIterator)`<[T](#state.SpanIterator^T) extends [RangeValue](#state.RangeValue)>`

Methods used when iterating over the spans created by a set of ranges. The entire iterated range will be covered with either `span` or `point` calls.

`**[span](#state.SpanIterator.span)**(  [from](#state.SpanIterator.span^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.SpanIterator.span^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [active](#state.SpanIterator.span^active): readonly [T](#state.SpanIterator^T)[],  [openStart](#state.SpanIterator.span^openStart): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  )`

Called for any ranges not covered by point decorations. `active` holds the values that the range is marked with (and may be empty). `openStart` indicates how many of those ranges are open (continued) at the start of the span.

`**[point](#state.SpanIterator.point)**(  [from](#state.SpanIterator.point^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#state.SpanIterator.point^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [value](#state.SpanIterator.point^value): [T](#state.SpanIterator^T),  [active](#state.SpanIterator.point^active): readonly [T](#state.SpanIterator^T)[],  [openStart](#state.SpanIterator.point^openStart): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [index](#state.SpanIterator.point^index): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  )`

Called when going over a point decoration. The active range decorations that cover the point and have a higher precedence are provided in `active`. The open count in `openStart` counts the number of those ranges that started before the point and. If the point started before the iterated range, `openStart` will be `active.length + 1` to signal this.

### Utilities

`**[combineConfig](#state.combineConfig)**<[Config](#state.combineConfig^Config) extends [object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)>(  [configs](#state.combineConfig^configs): readonly [Partial](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)<[Config](#state.combineConfig^Config)>[],  [defaults](#state.combineConfig^defaults): [Partial](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)<[Config](#state.combineConfig^Config)>,  [combine](#state.combineConfig^combine)⁠?: {  [[P](#state.combineConfig^combine^P) in keyof [Config](#state.combineConfig^Config)]: fn([first](#state.combineConfig^combine^first): [Config](#state.combineConfig^Config)[[P](#state.combineConfig^combine^P)], [second](#state.combineConfig^combine^second): [Config](#state.combineConfig^Config)[[P](#state.combineConfig^combine^P)]) → [Config](#state.combineConfig^Config)[[P](#state.combineConfig^combine^P)]  } = {}  ) → [Config](#state.combineConfig^Config)`

Utility function for combining behaviors to fill in a config object from an array of provided configs. `defaults` should hold default values for all optional fields in `Config`.

The function will, by default, error when a field gets two values that aren't `===`\-equal, but you can provide combine functions per field to do something else.

## [@codemirror/view](#view)

The “view” is the part of the editor that the user sees—a DOM component that displays the editor state and allows text input.

#### `interface` [EditorViewConfig](#view.EditorViewConfig) `extends [EditorStateConfig](#state.EditorStateConfig)`

The type of object given to the [`EditorView`](#view.EditorView) constructor.

`**[state](#view.EditorViewConfig.state)**⁠?: [EditorState](#state.EditorState)`

The view's initial state. If not given, a new state is created by passing this configuration object to [`EditorState.create`](#state.EditorState%5Ecreate), using its `doc`, `selection`, and `extensions` field (if provided).

`**[parent](#view.EditorViewConfig.parent)**⁠?: [Element](https://developer.mozilla.org/en/docs/DOM/Element) | [DocumentFragment](https://developer.mozilla.org/en/docs/DOM/document.createDocumentFragment)`

When given, the editor is immediately appended to the given element on creation. (Otherwise, you'll have to place the view's [`dom`](#view.EditorView.dom) element in the document yourself.)

`**[root](#view.EditorViewConfig.root)**⁠?: [Document](https://developer.mozilla.org/en/docs/DOM/document) | [ShadowRoot](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot)`

If the view is going to be mounted in a shadow root or document other than the one held by the global variable `document` (the default), you should pass it here. If you provide `parent`, but not this option, the editor will automatically look up a root from the parent.

`**[scrollTo](#view.EditorViewConfig.scrollTo)**⁠?: [StateEffect](#state.StateEffect)<any>`

Pass an effect created with [`EditorView.scrollIntoView`](#view.EditorView%5EscrollIntoView) or [`EditorView.scrollSnapshot`](#view.EditorView.scrollSnapshot) here to set an initial scroll position.

`**[dispatchTransactions](#view.EditorViewConfig.dispatchTransactions)**⁠?: fn([trs](#view.EditorViewConfig.dispatchTransactions^trs): readonly [Transaction](#state.Transaction)[], [view](#view.EditorViewConfig.dispatchTransactions^view): [EditorView](#view.EditorView))`

Override the way transactions are [dispatched](#view.EditorView.dispatch) for this editor view. Your implementation, if provided, should probably call the view's [`update` method](#view.EditorView.update).

`**[dispatch](#view.EditorViewConfig.dispatch)**⁠?: fn([tr](#view.EditorViewConfig.dispatch^tr): [Transaction](#state.Transaction), [view](#view.EditorViewConfig.dispatch^view): [EditorView](#view.EditorView))`

**Deprecated** single-transaction version of `dispatchTransactions`. Will force transactions to be dispatched one at a time when used.

#### `class` [EditorView](#view.EditorView)

An editor view represents the editor's user interface. It holds the editable DOM surface, and possibly other elements such as the line number gutter. It handles events and dispatches state transactions for editing actions.

`new **[EditorView](#view.EditorView.constructor)**([config](#view.EditorView.constructor^config)⁠?: [EditorViewConfig](#view.EditorViewConfig) = {})`

Construct a new view. You'll want to either provide a `parent` option, or put `view.dom` into your document after creating a view, so that the user can see the editor.

`**[state](#view.EditorView.state)**: [EditorState](#state.EditorState)`

The current editor state.

`**[viewport](#view.EditorView.viewport)**: {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

To be able to display large documents without consuming too much memory or overloading the browser, CodeMirror only draws the code that is visible (plus a margin around it) to the DOM. This property tells you the extent of the current drawn viewport, in document positions.

`**[visibleRanges](#view.EditorView.visibleRanges)**: readonly {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}[]`

When there are, for example, large collapsed ranges in the viewport, its size can be a lot bigger than the actual visible content. Thus, if you are doing something like styling the content in the viewport, it is preferable to only do so for these ranges, which are the subset of the viewport that is actually drawn.

`**[inView](#view.EditorView.inView)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns false when the editor is entirely scrolled out of view or otherwise hidden.

`**[composing](#view.EditorView.composing)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether the user is currently composing text via [IME](https://en.wikipedia.org/wiki/Input_method), and at least one change has been made in the current composition.

`**[compositionStarted](#view.EditorView.compositionStarted)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether the user is currently in composing state. Note that on some platforms, like Android, this will be the case a lot, since just putting the cursor on a word starts a composition there.

`**[root](#view.EditorView.root)**: [DocumentOrShadowRoot](https://developer.mozilla.org/en-US/docs/Web/API/DocumentOrShadowRoot)`

The document or shadow root that the view lives in.

`**[dom](#view.EditorView.dom)**: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The DOM element that wraps the entire editor view.

`**[scrollDOM](#view.EditorView.scrollDOM)**: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The DOM element that can be styled to scroll. (Note that it may not have been, so you can't assume this is scrollable.)

`**[contentDOM](#view.EditorView.contentDOM)**: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The editable DOM element holding the editor content. You should not, usually, interact with this content directly though the DOM, since the editor will immediately undo most of the changes you make. Instead, [dispatch](#view.EditorView.dispatch) [transactions](#state.Transaction) to modify content, and [decorations](#view.Decoration) to style it.

`**[dispatch](#view.EditorView.dispatch)**([tr](#view.EditorView.dispatch^tr): [Transaction](#state.Transaction))`

`**[dispatch](#view.EditorView.dispatch)**([trs](#view.EditorView.dispatch^trs): readonly [Transaction](#state.Transaction)[])`

`**[dispatch](#view.EditorView.dispatch)**(...[specs](#view.EditorView.dispatch^specs): [TransactionSpec](#state.TransactionSpec)[])`

All regular editor state updates should go through this. It takes a transaction, array of transactions, or transaction spec and updates the view to show the new state produced by that transaction. Its implementation can be overridden with an [option](#view.EditorView.constructor%5Econfig.dispatchTransactions). This function is bound to the view instance, so it does not have to be called as a method.

Note that when multiple `TransactionSpec` arguments are provided, these define a single transaction (the specs will be merged), not a sequence of transactions.

`**[update](#view.EditorView.update)**([transactions](#view.EditorView.update^transactions): readonly [Transaction](#state.Transaction)[])`

Update the view for the given array of transactions. This will update the visible document and selection to match the state produced by the transactions, and notify view plugins of the change. You should usually call [`dispatch`](#view.EditorView.dispatch) instead, which uses this as a primitive.

`**[setState](#view.EditorView.setState)**([newState](#view.EditorView.setState^newState): [EditorState](#state.EditorState))`

Reset the view to the given state. (This will cause the entire document to be redrawn and all view plugins to be reinitialized, so you should probably only use it when the new state isn't derived from the old state. Otherwise, use [`dispatch`](#view.EditorView.dispatch) instead.)

`**[themeClasses](#view.EditorView.themeClasses)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Get the CSS classes for the currently active editor themes.

`**[requestMeasure](#view.EditorView.requestMeasure)**<[T](#view.EditorView.requestMeasure^T)>([request](#view.EditorView.requestMeasure^request)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object))`

Schedule a layout measurement, optionally providing callbacks to do custom DOM measuring followed by a DOM write phase. Using this is preferable reading DOM layout directly from, for example, an event handler, because it'll make sure measuring and drawing done by other components is synchronized, avoiding unnecessary DOM layout computations.

`**[request](#view.EditorView.requestMeasure^request)**`

`**[read](#view.EditorView.requestMeasure^request.read)**([view](#view.EditorView.requestMeasure^request.read^view): [EditorView](#view.EditorView)) → [T](#view.EditorView.requestMeasure^T)`

Called in a DOM read phase to gather information that requires DOM layout. Should _not_ mutate the document.

`**[write](#view.EditorView.requestMeasure^request.write)**⁠?: fn([measure](#view.EditorView.requestMeasure^request.write^measure): [T](#view.EditorView.requestMeasure^T), [view](#view.EditorView.requestMeasure^request.write^view): [EditorView](#view.EditorView))`

Called in a DOM write phase to update the document. Should _not_ do anything that triggers DOM layout.

`**[key](#view.EditorView.requestMeasure^request.key)**⁠?: any`

When multiple requests with the same key are scheduled, only the last one will actually be run.

`**[plugin](#view.EditorView.plugin)**<[T](#view.EditorView.plugin^T) extends [PluginValue](#view.PluginValue)>([plugin](#view.EditorView.plugin^plugin): [ViewPlugin](#view.ViewPlugin)<[T](#view.EditorView.plugin^T), any>) → [T](#view.EditorView.plugin^T) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the value of a specific plugin, if present. Note that plugins that crash can be dropped from a view, so even when you know you registered a given plugin, it is recommended to check the return value of this method.

`**[documentTop](#view.EditorView.documentTop)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The top position of the document, in screen coordinates. This may be negative when the editor is scrolled down. Points directly to the top of the first line, not above the padding.

`**[documentPadding](#view.EditorView.documentPadding)**: {top: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), bottom: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

Reports the padding above and below the document.

`**[scaleX](#view.EditorView.scaleX)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

If the editor is transformed with CSS, this provides the scale along the X axis. Otherwise, it will just be 1. Note that transforms other than translation and scaling are not supported.

`**[scaleY](#view.EditorView.scaleY)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Provide the CSS transformed scale along the Y axis.

`**[elementAtHeight](#view.EditorView.elementAtHeight)**([height](#view.EditorView.elementAtHeight^height): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [BlockInfo](#view.BlockInfo)`

Find the text line or block widget at the given vertical position (which is interpreted as relative to the [top of the document](#view.EditorView.documentTop)).

`**[lineBlockAtHeight](#view.EditorView.lineBlockAtHeight)**([height](#view.EditorView.lineBlockAtHeight^height): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [BlockInfo](#view.BlockInfo)`

Find the line block (see [`lineBlockAt`](#view.EditorView.lineBlockAt)) at the given height, again interpreted relative to the [top of the document](#view.EditorView.documentTop).

`**[viewportLineBlocks](#view.EditorView.viewportLineBlocks)**: [BlockInfo](#view.BlockInfo)[]`

Get the extent and vertical position of all [line blocks](#view.EditorView.lineBlockAt) in the viewport. Positions are relative to the [top of the document](#view.EditorView.documentTop);

`**[lineBlockAt](#view.EditorView.lineBlockAt)**([pos](#view.EditorView.lineBlockAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [BlockInfo](#view.BlockInfo)`

Find the line block around the given document position. A line block is a range delimited on both sides by either a non-[hidden](#view.Decoration%5Ereplace) line break, or the start/end of the document. It will usually just hold a line of text, but may be broken into multiple textblocks by block widgets.

`**[contentHeight](#view.EditorView.contentHeight)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The editor's total content height.

`**[moveByChar](#view.EditorView.moveByChar)**(  [start](#view.EditorView.moveByChar^start): [SelectionRange](#state.SelectionRange),  [forward](#view.EditorView.moveByChar^forward): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  [by](#view.EditorView.moveByChar^by)⁠?: fn([initial](#view.EditorView.moveByChar^by^initial): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → fn([next](#view.EditorView.moveByChar^by^returns^next): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  ) → [SelectionRange](#state.SelectionRange)`

Move a cursor position by [grapheme cluster](#state.findClusterBreak). `forward` determines whether the motion is away from the line start, or towards it. In bidirectional text, the line is traversed in visual order, using the editor's [text direction](#view.EditorView.textDirection). When the start position was the last one on the line, the returned position will be across the line break. If there is no further line, the original position is returned.

By default, this method moves over a single cluster. The optional `by` argument can be used to move across more. It will be called with the first cluster as argument, and should return a predicate that determines, for each subsequent cluster, whether it should also be moved over.

`**[moveByGroup](#view.EditorView.moveByGroup)**([start](#view.EditorView.moveByGroup^start): [SelectionRange](#state.SelectionRange), [forward](#view.EditorView.moveByGroup^forward): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [SelectionRange](#state.SelectionRange)`

Move a cursor position across the next group of either [letters](#state.EditorState.charCategorizer) or non-letter non-whitespace characters.

`**[visualLineSide](#view.EditorView.visualLineSide)**([line](#view.EditorView.visualLineSide^line): [Line](#state.Line), [end](#view.EditorView.visualLineSide^end): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [SelectionRange](#state.SelectionRange)`

Get the cursor position visually at the start or end of a line. Note that this may differ from the _logical_ position at its start or end (which is simply at `line.from`/`line.to`) if text at the start or end goes against the line's base text direction.

`**[moveToLineBoundary](#view.EditorView.moveToLineBoundary)**(  [start](#view.EditorView.moveToLineBoundary^start): [SelectionRange](#state.SelectionRange),  [forward](#view.EditorView.moveToLineBoundary^forward): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  [includeWrap](#view.EditorView.moveToLineBoundary^includeWrap)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = true  ) → [SelectionRange](#state.SelectionRange)`

Move to the next line boundary in the given direction. If `includeWrap` is true, line wrapping is on, and there is a further wrap point on the current line, the wrap point will be returned. Otherwise this function will return the start or end of the line.

`**[moveVertically](#view.EditorView.moveVertically)**(  [start](#view.EditorView.moveVertically^start): [SelectionRange](#state.SelectionRange),  [forward](#view.EditorView.moveVertically^forward): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  [distance](#view.EditorView.moveVertically^distance)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [SelectionRange](#state.SelectionRange)`

Move a cursor position vertically. When `distance` isn't given, it defaults to moving to the next line (including wrapped lines). Otherwise, `distance` should provide a positive distance in pixels.

When `start` has a [`goalColumn`](#state.SelectionRange.goalColumn), the vertical motion will use that as a target horizontal position. Otherwise, the cursor's own horizontal position is used. The returned cursor will have its goal column set to whichever column was used.

`**[domAtPos](#view.EditorView.domAtPos)**([pos](#view.EditorView.domAtPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [side](#view.EditorView.domAtPos^side)⁠?: -1 | 1 = 1) → {node: [Node](https://developer.mozilla.org/en/docs/DOM/Node), offset: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

Find the DOM parent node and offset (child offset if `node` is an element, character offset when it is a text node) at the given document position.

Note that for positions that aren't currently in `visibleRanges`, the resulting DOM position isn't necessarily meaningful (it may just point before or after a placeholder element).

`**[posAtDOM](#view.EditorView.posAtDOM)**([node](#view.EditorView.posAtDOM^node): [Node](https://developer.mozilla.org/en/docs/DOM/Node), [offset](#view.EditorView.posAtDOM^offset)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Find the document position at the given DOM node. Can be useful for associating positions with DOM events. Will raise an error when `node` isn't part of the editor content.

`**[posAtCoords](#view.EditorView.posAtCoords)**([coords](#view.EditorView.posAtCoords^coords): {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}, [precise](#view.EditorView.posAtCoords^precise): [false](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[posAtCoords](#view.EditorView.posAtCoords)**([coords](#view.EditorView.posAtCoords^coords): {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the document position at the given screen coordinates. For positions not covered by the visible viewport's DOM structure, this will return null, unless `false` is passed as second argument, in which case it'll return an estimated position that would be near the coordinates if it were rendered.

`**[posAndSideAtCoords](#view.EditorView.posAndSideAtCoords)**([coords](#view.EditorView.posAndSideAtCoords^coords): {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}, [precise](#view.EditorView.posAndSideAtCoords^precise): [false](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → {pos: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), assoc: -1 | 1}`

`**[posAndSideAtCoords](#view.EditorView.posAndSideAtCoords)**([coords](#view.EditorView.posAndSideAtCoords^coords): {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}) → {pos: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), assoc: -1 | 1} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Like [`posAtCoords`](#view.EditorView.posAtCoords), but also returns which side of the position the coordinates are closest to. For example, for coordinates on the left side of a left-to-right character, the position before that letter is returned, with `assoc` 1, whereas on the right side, you'd get the position after the character, with `assoc` -1.

`**[coordsAtPos](#view.EditorView.coordsAtPos)**([pos](#view.EditorView.coordsAtPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [side](#view.EditorView.coordsAtPos^side)⁠?: -1 | 1 = 1) → [Rect](#view.Rect) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the screen coordinates at the given document position. `side` determines whether the coordinates are based on the element before (-1) or after (1) the position (if no element is available on the given side, the method will transparently use another strategy to get reasonable coordinates).

`**[coordsForChar](#view.EditorView.coordsForChar)**([pos](#view.EditorView.coordsForChar^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Rect](#view.Rect) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Return the rectangle around a given character. If `pos` does not point in front of a character that is in the viewport and rendered (i.e. not replaced, not a line break), this will return null. For space characters that are a line wrap point, this will return the position before the line break.

`**[defaultCharacterWidth](#view.EditorView.defaultCharacterWidth)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The default width of a character in the editor. May not accurately reflect the width of all characters (given variable width fonts or styling of invididual ranges).

`**[defaultLineHeight](#view.EditorView.defaultLineHeight)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The default height of a line in the editor. May not be accurate for all lines.

`**[textDirection](#view.EditorView.textDirection)**: [Direction](#view.Direction)`

The text direction ([`direction`](https://developer.mozilla.org/en-US/docs/Web/CSS/direction) CSS property) of the editor's content element.

`**[textDirectionAt](#view.EditorView.textDirectionAt)**([pos](#view.EditorView.textDirectionAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Direction](#view.Direction)`

Find the text direction of the block at the given position, as assigned by CSS. If [`perLineTextDirection`](#view.EditorView%5EperLineTextDirection) isn't enabled, or the given position is outside of the viewport, this will always return the same as [`textDirection`](#view.EditorView.textDirection). Note that this may trigger a DOM layout.

`**[lineWrapping](#view.EditorView.lineWrapping)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether this editor [wraps lines](#view.EditorView.lineWrapping) (as determined by the [`white-space`](https://developer.mozilla.org/en-US/docs/Web/CSS/white-space) CSS property of its content element).

`**[bidiSpans](#view.EditorView.bidiSpans)**([line](#view.EditorView.bidiSpans^line): [Line](#state.Line)) → readonly [BidiSpan](#view.BidiSpan)[]`

Returns the bidirectional text structure of the given line (which should be in the current document) as an array of span objects. The order of these spans matches the [text direction](#view.EditorView.textDirection)—if that is left-to-right, the leftmost spans come first, otherwise the rightmost spans come first.

`**[hasFocus](#view.EditorView.hasFocus)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Check whether the editor has focus.

`**[focus](#view.EditorView.focus)**()`

Put focus on the editor.

`**[setRoot](#view.EditorView.setRoot)**([root](#view.EditorView.setRoot^root): [Document](https://developer.mozilla.org/en/docs/DOM/document) | [ShadowRoot](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot))`

Update the [root](##view.EditorViewConfig.root) in which the editor lives. This is only necessary when moving the editor's existing DOM to a new window or shadow root.

`**[destroy](#view.EditorView.destroy)**()`

Clean up this editor view, removing its element from the document, unregistering event handlers, and notifying plugins. The view instance can no longer be used after calling this.

`**[scrollSnapshot](#view.EditorView.scrollSnapshot)**() → [StateEffect](#state.StateEffect)<  {  range: [SelectionRange](#state.SelectionRange),  y: "nearest" | "start" | "end" | "center",  x: "nearest" | "start" | "end" | "center",  yMargin: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  xMargin: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  isSnapshot: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  map: fn([changes](#view.EditorView.scrollSnapshot^returns.map^changes): [ChangeDesc](#state.ChangeDesc)) → [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object),  clip: fn([state](#view.EditorView.scrollSnapshot^returns.clip^state): [EditorState](#state.EditorState)) → [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)  }  >`

Return an effect that resets the editor to its current (at the time this method was called) scroll position. Note that this only affects the editor's own scrollable element, not parents. See also [`EditorViewConfig.scrollTo`](#view.EditorViewConfig.scrollTo).

The effect should be used with a document identical to the one it was created for. Failing to do so is not an error, but may not scroll to the expected position. You can [map](#state.StateEffect.map) the effect to account for changes.

`**[setTabFocusMode](#view.EditorView.setTabFocusMode)**([to](#view.EditorView.setTabFocusMode^to)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

Enable or disable tab-focus mode, which disables key bindings for Tab and Shift-Tab, letting the browser's default focus-changing behavior go through instead. This is useful to prevent trapping keyboard users in your editor.

Without argument, this toggles the mode. With a boolean, it enables (true) or disables it (false). Given a number, it temporarily enables the mode until that number of milliseconds have passed or another non-Tab key is pressed.

`static **[scrollIntoView](#view.EditorView^scrollIntoView)**([pos](#view.EditorView^scrollIntoView^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [SelectionRange](#state.SelectionRange), [options](#view.EditorView^scrollIntoView^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [StateEffect](#state.StateEffect)<unknown>`

Returns an effect that can be [added](#state.TransactionSpec.effects) to a transaction to cause it to scroll the given position or range into view.

`**[options](#view.EditorView^scrollIntoView^options)**`

`**[y](#view.EditorView^scrollIntoView^options.y)**⁠?: "nearest" | "start" | "end" | "center"`

By default (`"nearest"`) the position will be vertically scrolled only the minimal amount required to move the given position into view. You can set this to `"start"` to move it to the top of the view, `"end"` to move it to the bottom, or `"center"` to move it to the center.

`**[x](#view.EditorView^scrollIntoView^options.x)**⁠?: "nearest" | "start" | "end" | "center"`

Effect similar to [`y`](#view.EditorView%5EscrollIntoView%5Eoptions.y), but for the horizontal scroll position.

`**[yMargin](#view.EditorView^scrollIntoView^options.yMargin)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Extra vertical distance to add when moving something into view. Not used with the `"center"` strategy. Defaults to 5. Must be less than the height of the editor.

`**[xMargin](#view.EditorView^scrollIntoView^options.xMargin)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Extra horizontal distance to add. Not used with the `"center"` strategy. Defaults to 5. Must be less than the width of the editor.

`static **[styleModule](#view.EditorView^styleModule)**: [Facet](#state.Facet)<[StyleModule](https://code.haverbeke.berlin/marijn/style-mod#documentation)>`

Facet to add a [style module](https://code.haverbeke.berlin/marijn/style-mod#documentation) to an editor view. The view will ensure that the module is mounted in its [document root](#view.EditorView.constructor%5Econfig.root).

`static **[domEventHandlers](#view.EditorView^domEventHandlers)**([handlers](#view.EditorView^domEventHandlers^handlers): [DOMEventHandlers](#view.DOMEventHandlers)<any>) → [Extension](#state.Extension)`

Returns an extension that can be used to add DOM event handlers. The value should be an object mapping event names to handler functions. For any given event, such functions are ordered by extension precedence, and the first handler to return true will be assumed to have handled that event, and no other handlers or built-in behavior will be activated for it. These are registered on the [content element](#view.EditorView.contentDOM), except for `scroll` handlers, which will be called any time the editor's [scroll element](#view.EditorView.scrollDOM) or one of its parent nodes is scrolled.

`static **[domEventObservers](#view.EditorView^domEventObservers)**([observers](#view.EditorView^domEventObservers^observers): [DOMEventHandlers](#view.DOMEventHandlers)<any>) → [Extension](#state.Extension)`

Create an extension that registers DOM event observers. Contrary to event [handlers](#view.EditorView%5EdomEventHandlers), observers can't be prevented from running by a higher-precedence handler returning true. They also don't prevent other handlers and observers from running when they return true, and should not call `preventDefault`.

`static **[inputHandler](#view.EditorView^inputHandler)**: [Facet](#state.Facet)<  fn(  [view](#view.EditorView^inputHandler^view): [EditorView](#view.EditorView),  [from](#view.EditorView^inputHandler^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#view.EditorView^inputHandler^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [text](#view.EditorView^inputHandler^text): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [insert](#view.EditorView^inputHandler^insert): fn() → [Transaction](#state.Transaction)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  >`

An input handler can override the way changes to the editable DOM content are handled. Handlers are passed the document positions between which the change was found, and the new content. When one returns true, no further input handlers are called and the default behavior is prevented.

The `insert` argument can be used to get the default transaction that would be applied for this input. This can be useful when dispatching the custom behavior as a separate transaction.

`static **[clipboardInputFilter](#view.EditorView^clipboardInputFilter)**: [Facet](#state.Facet)<fn([text](#view.EditorView^clipboardInputFilter^text): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [state](#view.EditorView^clipboardInputFilter^state): [EditorState](#state.EditorState)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

Functions provided in this facet will be used to transform text pasted or dropped into the editor.

`static **[clipboardOutputFilter](#view.EditorView^clipboardOutputFilter)**: [Facet](#state.Facet)<fn([text](#view.EditorView^clipboardOutputFilter^text): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [state](#view.EditorView^clipboardOutputFilter^state): [EditorState](#state.EditorState)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

Transform text copied or dragged from the editor.

`static **[scrollHandler](#view.EditorView^scrollHandler)**: [Facet](#state.Facet)<  fn(  [view](#view.EditorView^scrollHandler^view): [EditorView](#view.EditorView),  [range](#view.EditorView^scrollHandler^range): [SelectionRange](#state.SelectionRange),  [options](#view.EditorView^scrollHandler^options): {  x: "nearest" | "start" | "end" | "center",  y: "nearest" | "start" | "end" | "center",  xMargin: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  yMargin: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  }  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  >`

Scroll handlers can override how things are scrolled into view. If they return `true`, no further handling happens for the scrolling. If they return false, the default scroll behavior is applied. Scroll handlers should never initiate editor updates.

`static **[focusChangeEffect](#view.EditorView^focusChangeEffect)**: [Facet](#state.Facet)<  fn([state](#view.EditorView^focusChangeEffect^state): [EditorState](#state.EditorState), [focusing](#view.EditorView^focusChangeEffect^focusing): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [StateEffect](#state.StateEffect)<any> | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

This facet can be used to provide functions that create effects to be dispatched when the editor's focus state changes.

`static **[perLineTextDirection](#view.EditorView^perLineTextDirection)**: [Facet](#state.Facet)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

By default, the editor assumes all its content has the same [text direction](#view.Direction). Configure this with a `true` value to make it read the text direction of every (rendered) line separately.

`static **[exceptionSink](#view.EditorView^exceptionSink)**: [Facet](#state.Facet)<fn([exception](#view.EditorView^exceptionSink^exception): any)>`

Allows you to provide a function that should be called when the library catches an exception from an extension (mostly from view plugins, but may be used by other extensions to route exceptions from user-code-provided callbacks). This is mostly useful for debugging and logging. See [`logException`](#view.logException).

`static **[updateListener](#view.EditorView^updateListener)**: [Facet](#state.Facet)<fn([update](#view.EditorView^updateListener^update): [ViewUpdate](#view.ViewUpdate))>`

A facet that can be used to register a function to be called every time the view updates.

`static **[editable](#view.EditorView^editable)**: [Facet](#state.Facet)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

Facet that controls whether the editor content DOM is editable. When its highest-precedence value is `false`, the element will not have its `contenteditable` attribute set. (Note that this doesn't affect API calls that change the editor content, even when those are bound to keys or buttons. See the [`readOnly`](#state.EditorState.readOnly) facet for that.)

`static **[mouseSelectionStyle](#view.EditorView^mouseSelectionStyle)**: [Facet](#state.Facet)<  fn([view](#view.EditorView^mouseSelectionStyle^view): [EditorView](#view.EditorView), [event](#view.EditorView^mouseSelectionStyle^event): [MouseEvent](https://developer.mozilla.org/en/docs/DOM/MouseEvent)) → [MouseSelectionStyle](#view.MouseSelectionStyle) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

Allows you to influence the way mouse selection happens. The functions in this facet will be called for a `mousedown` event on the editor, and can return an object that overrides the way a selection is computed from that mouse click or drag.

`static **[dragMovesSelection](#view.EditorView^dragMovesSelection)**: [Facet](#state.Facet)<fn([event](#view.EditorView^dragMovesSelection^event): [MouseEvent](https://developer.mozilla.org/en/docs/DOM/MouseEvent)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

Facet used to configure whether a given selection drag event should move or copy the selection. The given predicate will be called with the `mousedown` event, and can return `true` when the drag should move the content.

`static **[clickAddsSelectionRange](#view.EditorView^clickAddsSelectionRange)**: [Facet](#state.Facet)<fn([event](#view.EditorView^clickAddsSelectionRange^event): [MouseEvent](https://developer.mozilla.org/en/docs/DOM/MouseEvent)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

Facet used to configure whether a given selecting click adds a new range to the existing selection or replaces it entirely. The default behavior is to check `event.metaKey` on macOS, and `event.ctrlKey` elsewhere.

`static **[decorations](#view.EditorView^decorations)**: [Facet](#state.Facet)<[DecorationSet](#view.DecorationSet) | fn([view](#view.EditorView^decorations^view): [EditorView](#view.EditorView)) → [DecorationSet](#view.DecorationSet)>`

A facet that determines which [decorations](#view.Decoration) are shown in the view. Decorations can be provided in two ways—directly, or via a function that takes an editor view.

Only decoration sets provided directly are allowed to influence the editor's vertical layout structure. The ones provided as functions are called _after_ the new viewport has been computed, and thus **must not** introduce block widgets or replacing decorations that cover line breaks.

If you want decorated ranges to behave like atomic units for cursor motion and deletion purposes, also provide the range set containing the decorations to [`EditorView.atomicRanges`](#view.EditorView%5EatomicRanges).

`static **[blockWrappers](#view.EditorView^blockWrappers)**: [Facet](#state.Facet)<  [RangeSet](#state.RangeSet)<[BlockWrapper](#view.BlockWrapper)> |  fn([view](#view.EditorView^blockWrappers^view): [EditorView](#view.EditorView)) → [RangeSet](#state.RangeSet)<[BlockWrapper](#view.BlockWrapper)>  >`

[Block wrappers](#view.BlockWrapper) provide a way to add DOM structure around editor lines and block widgets. Sets of wrappers are provided in a similar way to decorations, and are nested in a similar way when they overlap. A wrapper affects all lines and block widgets that start inside its range.

`static **[outerDecorations](#view.EditorView^outerDecorations)**: [Facet](#state.Facet)<[DecorationSet](#view.DecorationSet) | fn([view](#view.EditorView^outerDecorations^view): [EditorView](#view.EditorView)) → [DecorationSet](#view.DecorationSet)>`

Facet that works much like [`decorations`](#view.EditorView%5Edecorations), but puts its inputs at the very bottom of the precedence stack, meaning mark decorations provided here will only be split by other, partially overlapping `outerDecorations` ranges, and wrap around all regular decorations. Use this for mark elements that should, as much as possible, remain in one piece.

`static **[atomicRanges](#view.EditorView^atomicRanges)**: [Facet](#state.Facet)<fn([view](#view.EditorView^atomicRanges^view): [EditorView](#view.EditorView)) → [RangeSet](#state.RangeSet)<any>>`

Used to provide ranges that should be treated as atoms as far as cursor motion is concerned. This causes methods like [`moveByChar`](#view.EditorView.moveByChar) and [`moveVertically`](#view.EditorView.moveVertically) (and the commands built on top of them) to skip across such regions when a selection endpoint would enter them. This does _not_ prevent direct programmatic [selection updates](#state.TransactionSpec.selection) from moving into such regions.

`static **[bidiIsolatedRanges](#view.EditorView^bidiIsolatedRanges)**: [Facet](#state.Facet)<[DecorationSet](#view.DecorationSet) | fn([view](#view.EditorView^bidiIsolatedRanges^view): [EditorView](#view.EditorView)) → [DecorationSet](#view.DecorationSet)>`

When range decorations add a `unicode-bidi: isolate` style, they should also include a [`bidiIsolate`](#view.MarkDecorationSpec.bidiIsolate) property in their decoration spec, and be exposed through this facet, so that the editor can compute the proper text order. (Other values for `unicode-bidi`, except of course `normal`, are not supported.)

`static **[cursorScrollMargin](#view.EditorView^cursorScrollMargin)**: [Facet](#state.Facet)<  [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)},  {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}  >`

Can be used to specify the distance that scrolling cursor into view keeps it away from the sides of the editor, either as a single pixel number or two different values for the different axes. Defaults to 5 pixels on both axes.

`static **[scrollMargins](#view.EditorView^scrollMargins)**: [Facet](#state.Facet)<fn([view](#view.EditorView^scrollMargins^view): [EditorView](#view.EditorView)) → [Partial](https://www.typescriptlang.org/docs/handbook/utility-types.html#partialtype)<[Rect](#view.Rect)> | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

Facet that allows extensions to provide additional scroll margins (space around the sides of the scrolling element that should be considered invisible). This can be useful when the plugin introduces elements that cover part of that element (for example a horizontally fixed gutter). Not to be confused with [`cursorScrollMargin`](#view.EditorView%5EcursorScrollMargin).

`static **[theme](#view.EditorView^theme)**([spec](#view.EditorView^theme^spec): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[StyleSpec](https://code.haverbeke.berlin/marijn/style-mod#documentation)>, [options](#view.EditorView^theme^options)⁠?: {dark⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)}) → [Extension](#state.Extension)`

Create a theme extension. The first argument can be a [`style-mod`](https://code.haverbeke.berlin/marijn/style-mod#documentation) style spec providing the styles for the theme. These will be prefixed with a generated class for the style.

Because the selectors will be prefixed with a scope class, rule that directly match the editor's [wrapper element](#view.EditorView.dom)—to which the scope class will be added—need to be explicitly differentiated by adding an `&` to the selector for that element—for example `&.cm-focused`.

When `dark` is set to true, the theme will be marked as dark, which will cause the `&dark` rules from [base themes](#view.EditorView%5EbaseTheme) to be used (as opposed to `&light` when a light theme is active).

`static **[darkTheme](#view.EditorView^darkTheme)**: [Facet](#state.Facet)<[boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

This facet records whether a dark theme is active. The extension returned by [`theme`](#view.EditorView%5Etheme) automatically includes an instance of this when the `dark` option is set to true.

`static **[baseTheme](#view.EditorView^baseTheme)**([spec](#view.EditorView^baseTheme^spec): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[StyleSpec](https://code.haverbeke.berlin/marijn/style-mod#documentation)>) → [Extension](#state.Extension)`

Create an extension that adds styles to the base theme. Like with [`theme`](#view.EditorView%5Etheme), use `&` to indicate the place of the editor wrapper element when directly targeting that. You can also use `&dark` or `&light` instead to only target editors with a dark or light theme.

`static **[cspNonce](#view.EditorView^cspNonce)**: [Facet](#state.Facet)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

Provides a Content Security Policy nonce to use when creating the style sheets for the editor. Holds the empty string when no nonce has been provided.

`static **[contentAttributes](#view.EditorView^contentAttributes)**: [Facet](#state.Facet)<  [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)> |  fn([view](#view.EditorView^contentAttributes^view): [EditorView](#view.EditorView)) → [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)> | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

Facet that provides additional DOM attributes for the editor's editable DOM element.

`static **[editorAttributes](#view.EditorView^editorAttributes)**: [Facet](#state.Facet)<  [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)> |  fn([view](#view.EditorView^editorAttributes^view): [EditorView](#view.EditorView)) → [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)> | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

Facet that provides DOM attributes for the editor's outer element.

`static **[lineWrapping](#view.EditorView^lineWrapping)**: [Extension](#state.Extension)`

An extension that enables line wrapping in the editor (by setting CSS `white-space` to `pre-wrap` in the content).

`static **[announce](#view.EditorView^announce)**: [StateEffectType](#state.StateEffectType)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

State effect used to include screen reader announcements in a transaction. These will be added to the DOM in a visually hidden element with `aria-live="polite"` set, and should be used to describe effects that are visually obvious but may not be noticed by screen reader users (such as moving to the next search match).

`static **[findFromDOM](#view.EditorView^findFromDOM)**([dom](#view.EditorView^findFromDOM^dom): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)) → [EditorView](#view.EditorView) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Retrieve an editor view instance from the view's DOM representation.

`enum **[Direction](#view.Direction)**`

Used to indicate [text direction](#view.EditorView.textDirection).

`**[LTR](#view.Direction.LTR)**`

Left-to-right.

`**[RTL](#view.Direction.RTL)**`

Right-to-left.

#### `class` [BlockInfo](#view.BlockInfo)

Record used to represent information about a block-level element in the editor view.

`**[from](#view.BlockInfo.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the element in the document.

`**[length](#view.BlockInfo.length)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The length of the element.

`**[top](#view.BlockInfo.top)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The top position of the element (relative to the top of the document).

`**[height](#view.BlockInfo.height)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Its height.

`**[type](#view.BlockInfo.type)**: [BlockType](#view.BlockType) | readonly [BlockInfo](#view.BlockInfo)[]`

The type of element this is. When querying lines, this may be an array of all the blocks that make up the line.

`**[to](#view.BlockInfo.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the element as a document position.

`**[bottom](#view.BlockInfo.bottom)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The bottom position of the element.

`**[widget](#view.BlockInfo.widget)**: [WidgetType](#view.WidgetType) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

If this is a widget block, this will return the widget associated with it.

`**[widgetLineBreaks](#view.BlockInfo.widgetLineBreaks)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

If this is a textblock, this holds the number of line breaks that appear in widgets inside the block.

`enum **[BlockType](#view.BlockType)**`

The different types of blocks that can occur in an editor view.

`**[Text](#view.BlockType.Text)**`

A line of text.

`**[WidgetBefore](#view.BlockType.WidgetBefore)**`

A block widget associated with the position after it.

`**[WidgetAfter](#view.BlockType.WidgetAfter)**`

A block widget associated with the position before it.

`**[WidgetRange](#view.BlockType.WidgetRange)**`

A block widget [replacing](#view.Decoration%5Ereplace) a range of content.

#### `class` [BidiSpan](#view.BidiSpan)

Represents a contiguous range of text that has a single direction (as in left-to-right or right-to-left).

`**[dir](#view.BidiSpan.dir)**: [Direction](#view.Direction)`

The direction of this span.

`**[from](#view.BidiSpan.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the span (relative to the start of the line).

`**[to](#view.BidiSpan.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the span.

`**[level](#view.BidiSpan.level)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The ["bidi level"](https://unicode.org/reports/tr9/#Basic_Display_Algorithm) of the span (in this context, 0 means left-to-right, 1 means right-to-left, 2 means left-to-right number inside right-to-left text).

`type **[DOMEventHandlers](#view.DOMEventHandlers)**<[This](#view.DOMEventHandlers^This)> = {  [[event](#view.DOMEventHandlers^event) in keyof [DOMEventMap](#view.DOMEventMap)]: fn([event](#view.DOMEventHandlers^event): [DOMEventMap](#view.DOMEventMap)[[event](#view.DOMEventHandlers^event)], [view](#view.DOMEventHandlers^view): [EditorView](#view.EditorView)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)  }`

Event handlers are specified with objects like this. For event types known by TypeScript, this will infer the event argument type to hold the appropriate event object type. For unknown events, it is inferred to `any`, and should be explicitly set if you want type checking.

#### `interface` [DOMEventMap](#view.DOMEventMap) `extends [HTMLElementEventMap](https://typhonjs-typedoc.github.io/ts-lib-docs/2023/dom/interfaces/HTMLElementEventMap.html)`

Helper type that maps event names to event object types, or the `any` type for unknown events.

`**[[string]](#view.DOMEventMap^string)**: any`

#### `interface` [Rect](#view.Rect)

Basic rectangle type.

`**[left](#view.Rect.left)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[right](#view.Rect.right)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[top](#view.Rect.top)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[bottom](#view.Rect.bottom)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

### Extending the View

`type **[Command](#view.Command)** = fn([target](#view.Command^target): [EditorView](#view.EditorView)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Command functions are used in key bindings and other types of user actions. Given an editor view, they check whether their effect can apply to the editor, and if it can, perform it as a side effect (which usually means [dispatching](#view.EditorView.dispatch) a transaction) and return `true`.

#### `class` [ViewPlugin](#view.ViewPlugin)`<[V](#view.ViewPlugin^V) extends [PluginValue](#view.PluginValue), [Arg](#view.ViewPlugin^Arg) = undefined>`

View plugins associate stateful values with a view. They can influence the way the content is drawn, and are notified of things that happen in the view. They optionally take an argument, in which case you need to call [`of`](#view.ViewPlugin.of) to create an extension for the plugin. When the argument type is undefined, you can use the plugin instance as an extension directly.

`**[extension](#view.ViewPlugin.extension)**: [Arg](#view.ViewPlugin^Arg) extends [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined) ? [Extension](#state.Extension) : [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

When `Arg` is undefined, instances of this class act as extensions. Otherwise, you have to call `of` to create an extension value.

`**[of](#view.ViewPlugin.of)**([arg](#view.ViewPlugin.of^arg): [Arg](#view.ViewPlugin^Arg)) → [Extension](#state.Extension)`

Create an extension for this plugin with the given argument.

`static **[define](#view.ViewPlugin^define)**<[V](#view.ViewPlugin^define^V) extends [PluginValue](#view.PluginValue), [Arg](#view.ViewPlugin^define^Arg) = undefined>(  [create](#view.ViewPlugin^define^create): fn([view](#view.ViewPlugin^define^create^view): [EditorView](#view.EditorView), [arg](#view.ViewPlugin^define^create^arg): [Arg](#view.ViewPlugin^define^Arg)) → [V](#view.ViewPlugin^define^V),  [spec](#view.ViewPlugin^define^spec)⁠?: [PluginSpec](#view.PluginSpec)<[V](#view.ViewPlugin^define^V)>  ) → [ViewPlugin](#view.ViewPlugin)<[V](#view.ViewPlugin^define^V), [Arg](#view.ViewPlugin^define^Arg)>`

Define a plugin from a constructor function that creates the plugin's value, given an editor view.

`static **[fromClass](#view.ViewPlugin^fromClass)**<[V](#view.ViewPlugin^fromClass^V) extends [PluginValue](#view.PluginValue), [Arg](#view.ViewPlugin^fromClass^Arg) = undefined>(  [cls](#view.ViewPlugin^fromClass^cls): {new ([view](#view.ViewPlugin^fromClass^cls^view): [EditorView](#view.EditorView), [arg](#view.ViewPlugin^fromClass^cls^arg): [Arg](#view.ViewPlugin^fromClass^Arg)) → [V](#view.ViewPlugin^fromClass^V)},  [spec](#view.ViewPlugin^fromClass^spec)⁠?: [PluginSpec](#view.PluginSpec)<[V](#view.ViewPlugin^fromClass^V)>  ) → [ViewPlugin](#view.ViewPlugin)<[V](#view.ViewPlugin^fromClass^V), [Arg](#view.ViewPlugin^fromClass^Arg)>`

Create a plugin for a class whose constructor takes a single editor view as argument.

#### `interface` [PluginValue](#view.PluginValue) `extends [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)`

This is the interface plugin objects conform to.

`**[update](#view.PluginValue.update)**⁠?: fn([update](#view.PluginValue.update^update): [ViewUpdate](#view.ViewUpdate))`

Notifies the plugin of an update that happened in the view. This is called _before_ the view updates its own DOM. It is responsible for updating the plugin's internal state (including any state that may be read by plugin fields) and _writing_ to the DOM for the changes in the update. To avoid unnecessary layout recomputations, it should _not_ read the DOM layout—use [`requestMeasure`](#view.EditorView.requestMeasure) to schedule your code in a DOM reading phase if you need to.

`**[docViewUpdate](#view.PluginValue.docViewUpdate)**⁠?: fn([view](#view.PluginValue.docViewUpdate^view): [EditorView](#view.EditorView))`

Called when the document view is updated (due to content, decoration, or viewport changes). Should not try to immediately start another view update. Often useful for calling [`requestMeasure`](#view.EditorView.requestMeasure).

`**[destroy](#view.PluginValue.destroy)**⁠?: fn()`

Called when the plugin is no longer going to be used. Should revert any changes the plugin made to the DOM.

#### `interface` [PluginSpec](#view.PluginSpec)`<[V](#view.PluginSpec^V) extends [PluginValue](#view.PluginValue)>`

Provides additional information when defining a [view plugin](#view.ViewPlugin).

`**[eventHandlers](#view.PluginSpec.eventHandlers)**⁠?: [DOMEventHandlers](#view.DOMEventHandlers)<[V](#view.PluginSpec^V)>`

Register the given [event handlers](#view.EditorView%5EdomEventHandlers) for the plugin. When called, these will have their `this` bound to the plugin value.

`**[eventObservers](#view.PluginSpec.eventObservers)**⁠?: [DOMEventHandlers](#view.DOMEventHandlers)<[V](#view.PluginSpec^V)>`

Registers [event observers](#view.EditorView%5EdomEventObservers) for the plugin. Will, when called, have their `this` bound to the plugin value.

`**[provide](#view.PluginSpec.provide)**⁠?: fn([plugin](#view.PluginSpec.provide^plugin): [ViewPlugin](#view.ViewPlugin)<[V](#view.PluginSpec^V), any>) → [Extension](#state.Extension)`

Specify that the plugin provides additional extensions when added to an editor configuration.

`**[decorations](#view.PluginSpec.decorations)**⁠?: fn([value](#view.PluginSpec.decorations^value): [V](#view.PluginSpec^V)) → [DecorationSet](#view.DecorationSet)`

Allow the plugin to provide decorations. When given, this should be a function that take the plugin value and return a [decoration set](#view.DecorationSet). See also the caveat about [layout-changing decorations](#view.EditorView%5Edecorations) that depend on the view.

#### `class` [ViewUpdate](#view.ViewUpdate)

View [plugins](#view.ViewPlugin) are given instances of this class, which describe what happened, whenever the view is updated.

`**[changes](#view.ViewUpdate.changes)**: [ChangeSet](#state.ChangeSet)`

The changes made to the document by this update.

`**[startState](#view.ViewUpdate.startState)**: [EditorState](#state.EditorState)`

The previous editor state.

`**[view](#view.ViewUpdate.view)**: [EditorView](#view.EditorView)`

The editor view that the update is associated with.

`**[state](#view.ViewUpdate.state)**: [EditorState](#state.EditorState)`

The new editor state.

`**[transactions](#view.ViewUpdate.transactions)**: readonly [Transaction](#state.Transaction)[]`

The transactions involved in the update. May be empty.

`**[viewportChanged](#view.ViewUpdate.viewportChanged)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Tells you whether the [viewport](#view.EditorView.viewport) or [visible ranges](#view.EditorView.visibleRanges) changed in this update.

`**[viewportMoved](#view.ViewUpdate.viewportMoved)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns true when [`viewportChanged`](#view.ViewUpdate.viewportChanged) is true and the viewport change is not just the result of mapping it in response to document changes.

`**[heightChanged](#view.ViewUpdate.heightChanged)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether the height of a block element in the editor changed in this update.

`**[geometryChanged](#view.ViewUpdate.geometryChanged)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns true when the document was modified or the size of the editor, or elements within the editor, changed.

`**[focusChanged](#view.ViewUpdate.focusChanged)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

True when this update indicates a focus change.

`**[docChanged](#view.ViewUpdate.docChanged)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the document changed in this update.

`**[selectionSet](#view.ViewUpdate.selectionSet)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the selection was explicitly set in this update.

`**[logException](#view.logException)**([state](#view.logException^state): [EditorState](#state.EditorState), [exception](#view.logException^exception): any, [context](#view.logException^context)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String))`

Log or report an unhandled exception in client code. Should probably only be used by extension code that allows client code to provide functions, and calls those functions in a context where an exception can't be propagated to calling code in a reasonable way (for example when in an event handler).

Either calls a handler registered with [`EditorView.exceptionSink`](#view.EditorView%5EexceptionSink), `window.onerror`, if defined, or `console.error` (in which case it'll pass `context`, when given, as first argument).

#### `interface` [MouseSelectionStyle](#view.MouseSelectionStyle)

Interface that objects registered with [`EditorView.mouseSelectionStyle`](#view.EditorView%5EmouseSelectionStyle) must conform to.

`**[get](#view.MouseSelectionStyle.get)**(  [curEvent](#view.MouseSelectionStyle.get^curEvent): [MouseEvent](https://developer.mozilla.org/en/docs/DOM/MouseEvent),  [extend](#view.MouseSelectionStyle.get^extend): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  [multiple](#view.MouseSelectionStyle.get^multiple): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  ) → [EditorSelection](#state.EditorSelection)`

Return a new selection for the mouse gesture that starts with the event that was originally given to the constructor, and ends with the event passed here. In case of a plain click, those may both be the `mousedown` event, in case of a drag gesture, the latest `mousemove` event will be passed.

When `extend` is true, that means the new selection should, if possible, extend the start selection. If `multiple` is true, the new selection should be added to the original selection.

`**[update](#view.MouseSelectionStyle.update)**([update](#view.MouseSelectionStyle.update^update): [ViewUpdate](#view.ViewUpdate)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Called when the view is updated while the gesture is in progress. When the document changes, it may be necessary to map some data (like the original selection or start position) through the changes.

This may return `true` to indicate that the `get` method should get queried again after the update, because something in the update could change its result. Be wary of infinite loops when using this (where `get` returns a new selection, which will trigger `update`, which schedules another `get` in response).

`**[drawSelection](#view.drawSelection)**([config](#view.drawSelection^config)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [Extension](#state.Extension)`

Returns an extension that hides the browser's native selection and cursor, replacing the selection with a background behind the text (with the `cm-selectionBackground` class), and the cursors with elements overlaid over the code (using `cm-cursor-primary` and `cm-cursor-secondary`).

This allows the editor to display secondary selection ranges, and tends to produce a type of selection more in line with that users expect in a text editor (the native selection styling will often leave gaps between lines and won't fill the horizontal space after a line when the selection continues past it).

It does have a performance cost, in that it requires an extra DOM layout cycle for many updates (the selection is drawn based on DOM layout information that's only available after laying out the content).

`**[config](#view.drawSelection^config)**`

`**[cursorBlinkRate](#view.drawSelection^config.cursorBlinkRate)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The length of a full cursor blink cycle, in milliseconds. Defaults to 1200. Can be set to 0 to disable blinking.

`**[drawRangeCursor](#view.drawSelection^config.drawRangeCursor)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether to show a cursor for non-empty ranges. Defaults to true.

`**[iosSelectionHandles](#view.drawSelection^config.iosSelectionHandles)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Because hiding the cursor also hides the selection handles in the iOS browser, when this is enabled (the default), the extension draws handles on the side of the selection in iOS.

`**[getDrawSelectionConfig](#view.getDrawSelectionConfig)**([state](#view.getDrawSelectionConfig^state): [EditorState](#state.EditorState)) → [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)`

Retrieve the [`drawSelection`](#view.drawSelection) configuration for this state. (Note that this will return a set of defaults even if `drawSelection` isn't enabled.)

`**[dropCursor](#view.dropCursor)**() → [Extension](#state.Extension)`

Draws a cursor at the current drop position when something is dragged over the editor.

`**[highlightActiveLine](#view.highlightActiveLine)**() → [Extension](#state.Extension)`

Mark lines that have a cursor on them with the `"cm-activeLine"` DOM class.

`**[highlightSpecialChars](#view.highlightSpecialChars)**(config⁠?: Object = {}) → [Extension](#state.Extension)`

Returns an extension that installs highlighting of special characters.

`**[config](#view.highlightSpecialChars^config)**`

Configuration options.

`**[render](#view.highlightSpecialChars^config.render)**⁠?: fn(  [code](#view.highlightSpecialChars^config.render^code): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [description](#view.highlightSpecialChars^config.render^description): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null),  [placeholder](#view.highlightSpecialChars^config.render^placeholder): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)  ) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

An optional function that renders the placeholder elements.

The `description` argument will be text that clarifies what the character is, which should be provided to screen readers (for example with the [`aria-label`](https://www.w3.org/TR/wai-aria/#aria-label) attribute) and optionally shown to the user in other ways (such as the [`title`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/title) attribute).

The given placeholder string is a suggestion for how to display the character visually.

`**[specialChars](#view.highlightSpecialChars^config.specialChars)**⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)`

Regular expression that matches the special characters to highlight. Must have its 'g'/global flag set.

`**[addSpecialChars](#view.highlightSpecialChars^config.addSpecialChars)**⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)`

Regular expression that can be used to add characters to the default set of characters to highlight.

`**[highlightWhitespace](#view.highlightWhitespace)**() → [Extension](#state.Extension)`

Returns an extension that highlights whitespace, adding a `cm-highlightSpace` class to stretches of spaces, and a `cm-highlightTab` class to individual tab characters. By default, the former are shown as faint dots, and the latter as arrows.

`**[highlightTrailingWhitespace](#view.highlightTrailingWhitespace)**() → [Extension](#state.Extension)`

Returns an extension that adds a `cm-trailingSpace` class to all trailing whitespace.

`**[placeholder](#view.placeholder)**(  [content](#view.placeholder^content): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) |  [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) |  fn([view](#view.placeholder^content^view): [EditorView](#view.EditorView)) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)  ) → [Extension](#state.Extension)`

Extension that enables a placeholder—a piece of example content to show when the editor is empty.

`**[scrollPastEnd](#view.scrollPastEnd)**() → [Extension](#state.Extension)`

Returns an extension that makes sure the content has a bottom margin equivalent to the height of the editor, minus one line height, so that every line in the document can be scrolled to the top of the editor.

This is only meaningful when the editor is scrollable, and should not be enabled in editors that take the size of their content.

### Key bindings

#### `interface` [KeyBinding](#view.KeyBinding)

Key bindings associate key names with [command](#view.Command)\-style functions.

Key names may be strings like `"Shift-Ctrl-Enter"`—a key identifier prefixed with zero or more modifiers. Key identifiers are based on the strings that can appear in [`KeyEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key). Use lowercase letters to refer to letter keys (or uppercase letters if you want shift to be held). You may use `"Space"` as an alias for the `" "` name.

Modifiers can be given in any order. `Shift-` (or `s-`), `Alt-` (or `a-`), `Ctrl-` (or `c-` or `Control-`) and `Cmd-` (or `m-` or `Meta-`) are recognized.

When a key binding contains multiple key names separated by spaces, it represents a multi-stroke binding, which will fire when the user presses the given keys after each other.

You can use `Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on other platforms. So `Mod-b` is `Ctrl-b` on Linux but `Cmd-b` on macOS.

`**[key](#view.KeyBinding.key)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The key name to use for this binding. If the platform-specific property (`mac`, `win`, or `linux`) for the current platform is used as well in the binding, that one takes precedence. If `key` isn't defined and the platform-specific binding isn't either, a binding is ignored.

`**[mac](#view.KeyBinding.mac)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Key to use specifically on macOS.

`**[win](#view.KeyBinding.win)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Key to use specifically on Windows.

`**[linux](#view.KeyBinding.linux)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Key to use specifically on Linux.

`**[run](#view.KeyBinding.run)**⁠?: [Command](#view.Command)`

The command to execute when this binding is triggered. When the command function returns `false`, further bindings will be tried for the key.

`**[shift](#view.KeyBinding.shift)**⁠?: [Command](#view.Command)`

When given, this defines a second binding, using the (possibly platform-specific) key name prefixed with `Shift-` to activate this command.

`**[any](#view.KeyBinding.any)**⁠?: fn([view](#view.KeyBinding.any^view): [EditorView](#view.EditorView), [event](#view.KeyBinding.any^event): [KeyboardEvent](https://developer.mozilla.org/en/docs/DOM/KeyboardEvent)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When this property is present, the function is called for every key that is not a multi-stroke prefix.

`**[scope](#view.KeyBinding.scope)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

By default, key bindings apply when focus is on the editor content (the `"editor"` scope). Some extensions, mostly those that define their own panels, might want to allow you to register bindings local to that panel. Such bindings should use a custom scope name. You may also assign multiple scope names to a binding, separating them by spaces.

`**[preventDefault](#view.KeyBinding.preventDefault)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When set to true (the default is false), this will always prevent the further handling for the bound key, even if the command(s) return false. This can be useful for cases where the native behavior of the key is annoying or irrelevant but the command doesn't always apply (such as, Mod-u for undo selection, which would cause the browser to view source instead when no selection can be undone).

`**[stopPropagation](#view.KeyBinding.stopPropagation)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When set to true, `stopPropagation` will be called on keyboard events that have their `preventDefault` called in response to this key binding (see also [`preventDefault`](#view.KeyBinding.preventDefault)).

`**[keymap](#view.keymap)**: [Facet](#state.Facet)<readonly [KeyBinding](#view.KeyBinding)[]>`

Facet used for registering keymaps.

You can add multiple keymaps to an editor. Their priorities determine their precedence (the ones specified early or with high priority get checked first). When a handler has returned `true` for a given key, no further handlers are called.

`**[runScopeHandlers](#view.runScopeHandlers)**([view](#view.runScopeHandlers^view): [EditorView](#view.EditorView), [event](#view.runScopeHandlers^event): [KeyboardEvent](https://developer.mozilla.org/en/docs/DOM/KeyboardEvent), [scope](#view.runScopeHandlers^scope): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Run the key handlers registered for a given scope. The event object should be a `"keydown"` event. Returns true if any of the handlers handled it.

### Decorations

Your code should not try to directly change the DOM structure CodeMirror creates for its content—that will not work. Instead, the way to influence how things are drawn is by providing decorations, which can add styling or replace content with an alternative representation.

#### `class` [Decoration](#view.Decoration) `extends [RangeValue](#state.RangeValue)`

A decoration provides information on how to draw or style a piece of content. You'll usually use it wrapped in a [`Range`](#state.Range), which adds a start and end position.

`**[spec](#view.Decoration.spec)**: any`

The config object used to create this decoration. You can include additional properties in there to store metadata about your decoration.

`static **[mark](#view.Decoration^mark)**([spec](#view.Decoration^mark^spec): Object) → [Decoration](#view.Decoration)`

Create a mark decoration, which influences the styling of the content in its range. Nested mark decorations will cause nested DOM elements to be created. Nesting order is determined by precedence of the [facet](#view.EditorView%5Edecorations), with the higher-precedence decorations creating the inner DOM nodes. Such elements are split on line boundaries and on the boundaries of lower-precedence decorations.

`**[spec](#view.Decoration^mark^spec)**`

`**[inclusive](#view.Decoration^mark^spec.inclusive)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the mark covers its start and end position or not. This influences whether content inserted at those positions becomes part of the mark. Defaults to false.

`**[inclusiveStart](#view.Decoration^mark^spec.inclusiveStart)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Specify whether the start position of the marked range should be inclusive. Overrides `inclusive`, when both are present.

`**[inclusiveEnd](#view.Decoration^mark^spec.inclusiveEnd)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the end should be inclusive.

`**[attributes](#view.Decoration^mark^spec.attributes)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

Add attributes to the DOM elements that hold the text in the marked range.

`**[class](#view.Decoration^mark^spec.class)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Shorthand for `{attributes: {class: value}}`.

`**[tagName](#view.Decoration^mark^spec.tagName)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Add a wrapping element around the text in the marked range. Note that there will not necessarily be a single element covering the entire range—other decorations with lower precedence might split this one if they partially overlap it, and line breaks always end decoration elements.

`**[bidiIsolate](#view.Decoration^mark^spec.bidiIsolate)**⁠?: [Direction](#view.Direction)`

When using sets of decorations in [`bidiIsolatedRanges`](##view.EditorView%5EbidiIsolatedRanges), this property provides the direction of the isolates. When null or not given, it indicates the range has `dir=auto`, and its direction should be derived from the first strong directional character in it.

`**[[string]](#view.Decoration^mark^spec^string)**: any`

Decoration specs allow extra properties, which can be retrieved through the decoration's [`spec`](#view.Decoration.spec) property.

`static **[widget](#view.Decoration^widget)**([spec](#view.Decoration^widget^spec): Object) → [Decoration](#view.Decoration)`

Create a widget decoration, which displays a DOM element at the given position.

`**[spec](#view.Decoration^widget^spec)**`

`**[widget](#view.Decoration^widget^spec.widget)**: [WidgetType](#view.WidgetType)`

The type of widget to draw here.

`**[side](#view.Decoration^widget^spec.side)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Which side of the given position the widget is on. When this is positive, the widget will be drawn after the cursor if the cursor is on the same position. Otherwise, it'll be drawn before it. When multiple widgets sit at the same position, their `side` values will determine their ordering—those with a lower value come first. Defaults to 0. May not be more than 10000 or less than -10000.

`**[inlineOrder](#view.Decoration^widget^spec.inlineOrder)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, to avoid unintended mixing of block and inline widgets, block widgets with a positive `side` are always drawn after all inline widgets at that position, and those with a non-positive side before inline widgets. Setting this option to `true` for a block widget will turn this off and cause it to be rendered between the inline widgets, ordered by `side`.

`**[block](#view.Decoration^widget^spec.block)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Determines whether this is a block widgets, which will be drawn between lines, or an inline widget (the default) which is drawn between the surrounding text.

Note that block-level decorations should not have vertical margins, and if you dynamically change their height, you should make sure to call [`requestMeasure`](#view.EditorView.requestMeasure), so that the editor can update its information about its vertical layout.

`**[[string]](#view.Decoration^widget^spec^string)**: any`

Other properties are allowed.

`static **[replace](#view.Decoration^replace)**([spec](#view.Decoration^replace^spec): Object) → [Decoration](#view.Decoration)`

Create a replace decoration which replaces the given range with a widget, or simply hides it.

`**[spec](#view.Decoration^replace^spec)**`

`**[widget](#view.Decoration^replace^spec.widget)**⁠?: [WidgetType](#view.WidgetType)`

An optional widget to drawn in the place of the replaced content.

`**[inclusive](#view.Decoration^replace^spec.inclusive)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether this range covers the positions on its sides. This influences whether new content becomes part of the range and whether the cursor can be drawn on its sides. Defaults to false for inline replacements, and true for block replacements.

`**[inclusiveStart](#view.Decoration^replace^spec.inclusiveStart)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Set inclusivity at the start.

`**[inclusiveEnd](#view.Decoration^replace^spec.inclusiveEnd)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Set inclusivity at the end.

`**[block](#view.Decoration^replace^spec.block)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether this is a block-level decoration. Defaults to false.

`**[[string]](#view.Decoration^replace^spec^string)**: any`

Other properties are allowed.

`static **[line](#view.Decoration^line)**([spec](#view.Decoration^line^spec): Object) → [Decoration](#view.Decoration)`

Create a line decoration, which can add DOM attributes to the line starting at the given position.

`**[spec](#view.Decoration^line^spec)**`

`**[attributes](#view.Decoration^line^spec.attributes)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

DOM attributes to add to the element wrapping the line.

`**[class](#view.Decoration^line^spec.class)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Shorthand for `{attributes: {class: value}}`.

`**[[string]](#view.Decoration^line^spec^string)**: any`

Other properties are allowed.

`static **[set](#view.Decoration^set)**(  [of](#view.Decoration^set^of): [Range](#state.Range)<[Decoration](#view.Decoration)> | readonly [Range](#state.Range)<[Decoration](#view.Decoration)>[],  [sort](#view.Decoration^set^sort)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false  ) → [DecorationSet](#view.DecorationSet)`

Build a [`DecorationSet`](#view.DecorationSet) from the given decorated range or ranges. If the ranges aren't already sorted, pass `true` for `sort` to make the library sort them for you.

`static **[none](#view.Decoration^none)**: [DecorationSet](#view.DecorationSet)`

The empty set of decorations.

`type **[DecorationSet](#view.DecorationSet)** = [RangeSet](#state.RangeSet)<[Decoration](#view.Decoration)>`

A decoration set represents a collection of decorated ranges, organized for efficient access and mapping. See [`RangeSet`](#state.RangeSet) for its methods.

#### `abstract class` [WidgetType](#view.WidgetType)

Widgets added to the content are described by subclasses of this class. Using a description object like that makes it possible to delay creating of the DOM structure for a widget until it is needed, and to avoid redrawing widgets even if the decorations that define them are recreated.

`abstract **[toDOM](#view.WidgetType.toDOM)**([view](#view.WidgetType.toDOM^view): [EditorView](#view.EditorView)) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

Build the DOM structure for this widget instance.

`**[eq](#view.WidgetType.eq)**([widget](#view.WidgetType.eq^widget): [WidgetType](#view.WidgetType)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this instance to another instance of the same type. (TypeScript can't express this, but only instances of the same specific class will be passed to this method.) This is used to avoid redrawing widgets when they are replaced by a new decoration of the same type. The default implementation just returns `false`, which will cause new instances of the widget to always be redrawn.

`**[updateDOM](#view.WidgetType.updateDOM)**([dom](#view.WidgetType.updateDOM^dom): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement), [view](#view.WidgetType.updateDOM^view): [EditorView](#view.EditorView), [from](#view.WidgetType.updateDOM^from): [WidgetType](#view.WidgetType)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Update a DOM element created by a widget of the same type (but different, non-`eq` content) to reflect this widget. May return true to indicate that it could update, false to indicate it couldn't (in which case the widget will be redrawn). The default implementation just returns false.

`**[estimatedHeight](#view.WidgetType.estimatedHeight)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The estimated height this widget will have, to be used when estimating the height of content that hasn't been drawn. May return -1 to indicate you don't know. The default implementation returns -1.

`**[lineBreaks](#view.WidgetType.lineBreaks)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

For inline widgets that are displayed inline (as opposed to `inline-block`) and introduce line breaks (through `<br>` tags or textual newlines), this must indicate the amount of line breaks they introduce. Defaults to 0.

`**[ignoreEvent](#view.WidgetType.ignoreEvent)**([event](#view.WidgetType.ignoreEvent^event): [Event](https://developer.mozilla.org/en-US/docs/DOM/event)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Can be used to configure which kinds of events inside the widget should be ignored by the editor. The default is to ignore all events.

`**[coordsAt](#view.WidgetType.coordsAt)**([dom](#view.WidgetType.coordsAt^dom): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement), [pos](#view.WidgetType.coordsAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [side](#view.WidgetType.coordsAt^side): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Rect](#view.Rect) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Override the way screen coordinates for positions at/in the widget are found. `pos` will be the offset into the widget, and `side` the side of the position that is being queried—less than zero for before, greater than zero for after, and zero for directly at that position.

`**[destroy](#view.WidgetType.destroy)**([dom](#view.WidgetType.destroy^dom): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement))`

This is called when the an instance of the widget is removed from the editor view.

#### `class` [MatchDecorator](#view.MatchDecorator)

Helper class used to make it easier to maintain decorations on visible code that matches a given regular expression. To be used in a [view plugin](#view.ViewPlugin). Instances of this object represent a matching configuration.

`new **[MatchDecorator](#view.MatchDecorator.constructor)**([config](#view.MatchDecorator.constructor^config): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object))`

Create a decorator.

`**[config](#view.MatchDecorator.constructor^config)**`

`**[regexp](#view.MatchDecorator.constructor^config.regexp)**: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)`

The regular expression to match against the content. Will only be matched inside lines (not across them). Should have its 'g' flag set.

`**[decoration](#view.MatchDecorator.constructor^config.decoration)**⁠?: [Decoration](#view.Decoration) |  fn([match](#view.MatchDecorator.constructor^config.decoration^match): [RegExpExecArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value), [view](#view.MatchDecorator.constructor^config.decoration^view): [EditorView](#view.EditorView), [pos](#view.MatchDecorator.constructor^config.decoration^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Decoration](#view.Decoration) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  `

The decoration to apply to matches, either directly or as a function of the match.

`**[decorate](#view.MatchDecorator.constructor^config.decorate)**⁠?: fn(  [add](#view.MatchDecorator.constructor^config.decorate^add): fn([from](#view.MatchDecorator.constructor^config.decorate^add^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#view.MatchDecorator.constructor^config.decorate^add^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [decoration](#view.MatchDecorator.constructor^config.decorate^add^decoration): [Decoration](#view.Decoration)),  [from](#view.MatchDecorator.constructor^config.decorate^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#view.MatchDecorator.constructor^config.decorate^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [match](#view.MatchDecorator.constructor^config.decorate^match): [RegExpExecArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value),  [view](#view.MatchDecorator.constructor^config.decorate^view): [EditorView](#view.EditorView)  )`

Customize the way decorations are added for matches. This function, when given, will be called for matches and should call `add` to create decorations for them. Note that the decorations should appear _in_ the given range, and the function should have no side effects beyond calling `add`.

The `decoration` option is ignored when `decorate` is provided.

`**[boundary](#view.MatchDecorator.constructor^config.boundary)**⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)`

By default, changed lines are re-matched entirely. You can provide a boundary expression, which should match single character strings that can never occur in `regexp`, to reduce the amount of re-matching.

`**[maxLength](#view.MatchDecorator.constructor^config.maxLength)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Matching happens by line, by default, but when lines are folded or very long lines are only partially drawn, the decorator may avoid matching part of them for speed. This controls how much additional invisible content it should include in its matches. Defaults to 1000.

`**[createDeco](#view.MatchDecorator.createDeco)**([view](#view.MatchDecorator.createDeco^view): [EditorView](#view.EditorView)) → [RangeSet](#state.RangeSet)<[Decoration](#view.Decoration)>`

Compute the full set of decorations for matches in the given view's viewport. You'll want to call this when initializing your plugin.

`**[updateDeco](#view.MatchDecorator.updateDeco)**([update](#view.MatchDecorator.updateDeco^update): [ViewUpdate](#view.ViewUpdate), [deco](#view.MatchDecorator.updateDeco^deco): [DecorationSet](#view.DecorationSet)) → [DecorationSet](#view.DecorationSet)`

Update a set of decorations for a view update. `deco` _must_ be the set of decorations produced by _this_ `MatchDecorator` for the view state before the update.

#### `class` [BlockWrapper](#view.BlockWrapper) `extends [RangeValue](#state.RangeValue)`

A block wrapper defines a DOM node that wraps lines or other block wrappers at the top of the document. It affects any line or block widget that starts inside its range, including blocks starting directly at `from` but not including `to`.

`static **[create](#view.BlockWrapper^create)**([spec](#view.BlockWrapper^create^spec): Object) → [BlockWrapper](#view.BlockWrapper)`

Create a block wrapper object with the given tag name and attributes.

`**[spec](#view.BlockWrapper^create^spec)**`

`**[tagName](#view.BlockWrapper^create^spec.tagName)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Tag name of the wrapping element.

`**[attributes](#view.BlockWrapper^create^spec.attributes)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

DOM attributes to add to the wrapping element.

`**[rank](#view.BlockWrapper^create^spec.rank)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

When multiple overlapping block wrappers are produced by the same source, this determines their relative precedence. Lower rank wrappers are nested inside higher-rank ones. Should be a number between 0 and 100.

`static **[set](#view.BlockWrapper^set)**(  [of](#view.BlockWrapper^set^of): [Range](#state.Range)<[BlockWrapper](#view.BlockWrapper)> | readonly [Range](#state.Range)<[BlockWrapper](#view.BlockWrapper)>[],  [sort](#view.BlockWrapper^set^sort)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = false  ) → [RangeSet](#state.RangeSet)<[BlockWrapper](#view.BlockWrapper)>`

Create a range set from the given block wrapper ranges.

### Gutters

Functionality for showing "gutters" (for line numbers or other purposes) on the side of the editor. See also the [gutter example](../../examples/gutter/).

`**[lineNumbers](#view.lineNumbers)**([config](#view.lineNumbers^config)⁠?: Object = {}) → [Extension](#state.Extension)`

Create a line number gutter extension.

`**[config](#view.lineNumbers^config)**`

`**[formatNumber](#view.lineNumbers^config.formatNumber)**⁠?: fn([lineNo](#view.lineNumbers^config.formatNumber^lineNo): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [state](#view.lineNumbers^config.formatNumber^state): [EditorState](#state.EditorState)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

How to display line numbers. Defaults to simply converting them to string.

`**[domEventHandlers](#view.lineNumbers^config.domEventHandlers)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<  fn([view](#view.lineNumbers^config.domEventHandlers^view): [EditorView](#view.EditorView), [line](#view.lineNumbers^config.domEventHandlers^line): [BlockInfo](#view.BlockInfo), [event](#view.lineNumbers^config.domEventHandlers^event): [Event](https://developer.mozilla.org/en-US/docs/DOM/event)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  >`

Supply event handlers for DOM events on this gutter.

`**[highlightActiveLineGutter](#view.highlightActiveLineGutter)**() → [Extension](#state.Extension)`

Returns an extension that adds a `cm-activeLineGutter` class to all gutter elements on the [active line](#view.highlightActiveLine).

`**[gutter](#view.gutter)**([config](#view.gutter^config): Object) → [Extension](#state.Extension)`

Define an editor gutter. The order in which the gutters appear is determined by their extension priority.

`**[config](#view.gutter^config)**`

`**[class](#view.gutter^config.class)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

An extra CSS class to be added to the wrapper (`cm-gutter`) element.

`**[renderEmptyElements](#view.gutter^config.renderEmptyElements)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Controls whether empty gutter elements should be rendered. Defaults to false.

`**[markers](#view.gutter^config.markers)**⁠?: fn([view](#view.gutter^config.markers^view): [EditorView](#view.EditorView)) → [RangeSet](#state.RangeSet)<[GutterMarker](#view.GutterMarker)> |  readonly [RangeSet](#state.RangeSet)<[GutterMarker](#view.GutterMarker)>[]  `

Retrieve a set of markers to use in this gutter.

`**[lineMarker](#view.gutter^config.lineMarker)**⁠?: fn(  [view](#view.gutter^config.lineMarker^view): [EditorView](#view.EditorView),  [line](#view.gutter^config.lineMarker^line): [BlockInfo](#view.BlockInfo),  [otherMarkers](#view.gutter^config.lineMarker^otherMarkers): readonly [GutterMarker](#view.GutterMarker)[]  ) → [GutterMarker](#view.GutterMarker) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Can be used to optionally add a single marker to every line.

`**[widgetMarker](#view.gutter^config.widgetMarker)**⁠?: fn([view](#view.gutter^config.widgetMarker^view): [EditorView](#view.EditorView), [widget](#view.gutter^config.widgetMarker^widget): [WidgetType](#view.WidgetType), [block](#view.gutter^config.widgetMarker^block): [BlockInfo](#view.BlockInfo)) → [GutterMarker](#view.GutterMarker) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Associate markers with block widgets in the document.

`**[lineMarkerChange](#view.gutter^config.lineMarkerChange)**⁠?: fn([update](#view.gutter^config.lineMarkerChange^update): [ViewUpdate](#view.ViewUpdate)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

If line or widget markers depend on additional state, and should be updated when that changes, pass a predicate here that checks whether a given view update might change the line markers.

`**[initialSpacer](#view.gutter^config.initialSpacer)**⁠?: fn([view](#view.gutter^config.initialSpacer^view): [EditorView](#view.EditorView)) → [GutterMarker](#view.GutterMarker)`

Add a hidden spacer element that gives the gutter its base width.

`**[updateSpacer](#view.gutter^config.updateSpacer)**⁠?: fn([spacer](#view.gutter^config.updateSpacer^spacer): [GutterMarker](#view.GutterMarker), [update](#view.gutter^config.updateSpacer^update): [ViewUpdate](#view.ViewUpdate)) → [GutterMarker](#view.GutterMarker)`

Update the spacer element when the view is updated.

`**[domEventHandlers](#view.gutter^config.domEventHandlers)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<  fn([view](#view.gutter^config.domEventHandlers^view): [EditorView](#view.EditorView), [line](#view.gutter^config.domEventHandlers^line): [BlockInfo](#view.BlockInfo), [event](#view.gutter^config.domEventHandlers^event): [Event](https://developer.mozilla.org/en-US/docs/DOM/event)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  >`

Supply event handlers for DOM events on this gutter.

`**[side](#view.gutter^config.side)**⁠?: "before" | "after"`

By default, gutters are shown horizontally before the editor content (to the left in a left-to-right layout). Set this to `"after"` to show a gutter on the other side of the content.

`**[gutters](#view.gutters)**([config](#view.gutters^config)⁠?: {fixed⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)}) → [Extension](#state.Extension)`

The gutter-drawing plugin is automatically enabled when you add a gutter, but you can use this function to explicitly configure it.

Unless `fixed` is explicitly set to `false`, the gutters are fixed, meaning they don't scroll along with the content horizontally (except on Internet Explorer, which doesn't support CSS [`position: sticky`](https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky)).

#### `abstract class` [GutterMarker](#view.GutterMarker) `extends [RangeValue](#state.RangeValue)`

A gutter marker represents a bit of information attached to a line in a specific gutter. Your own custom markers have to extend this class.

`**[eq](#view.GutterMarker.eq)**([other](#view.GutterMarker.eq^other): [GutterMarker](#view.GutterMarker)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this marker to another marker of the same type.

`**[toDOM](#view.GutterMarker.toDOM)**⁠?: fn([view](#view.GutterMarker.toDOM^view): [EditorView](#view.EditorView)) → [Node](https://developer.mozilla.org/en/docs/DOM/Node)`

Render the DOM node for this marker, if any.

`**[elementClass](#view.GutterMarker.elementClass)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

This property can be used to add CSS classes to the gutter element that contains this marker.

`**[destroy](#view.GutterMarker.destroy)**([dom](#view.GutterMarker.destroy^dom): [Node](https://developer.mozilla.org/en/docs/DOM/Node))`

Called if the marker has a `toDOM` method and its representation was removed from a gutter.

`**[gutterLineClass](#view.gutterLineClass)**: [Facet](#state.Facet)<[RangeSet](#state.RangeSet)<[GutterMarker](#view.GutterMarker)>>`

Facet used to add a class to all gutter elements for a given line. Markers given to this facet should _only_ define an [`elementclass`](#view.GutterMarker.elementClass), not a [`toDOM`](#view.GutterMarker.toDOM) (or the marker will appear in all gutters for the line).

`**[gutterWidgetClass](#view.gutterWidgetClass)**: [Facet](#state.Facet)<  fn([view](#view.gutterWidgetClass^view): [EditorView](#view.EditorView), [widget](#view.gutterWidgetClass^widget): [WidgetType](#view.WidgetType), [block](#view.gutterWidgetClass^block): [BlockInfo](#view.BlockInfo)) → [GutterMarker](#view.GutterMarker) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

Facet used to add a class to all gutter elements next to a widget. Should not provide widgets with a `toDOM` method.

`**[lineNumberMarkers](#view.lineNumberMarkers)**: [Facet](#state.Facet)<[RangeSet](#state.RangeSet)<[GutterMarker](#view.GutterMarker)>>`

Facet used to provide markers to the line number gutter.

`**[lineNumberWidgetMarker](#view.lineNumberWidgetMarker)**: [Facet](#state.Facet)<  fn([view](#view.lineNumberWidgetMarker^view): [EditorView](#view.EditorView), [widget](#view.lineNumberWidgetMarker^widget): [WidgetType](#view.WidgetType), [block](#view.lineNumberWidgetMarker^block): [BlockInfo](#view.BlockInfo)) → [GutterMarker](#view.GutterMarker) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

Facet used to create markers in the line number gutter next to widgets.

### Tooltips

Tooltips are DOM elements overlaid on the editor near a given document position. This package helps manage and position such elements.

See also the [tooltip example](../../examples/tooltip/).

`**[showTooltip](#view.showTooltip)**: [Facet](#state.Facet)<[Tooltip](#view.Tooltip) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

Facet to which an extension can add a value to show a tooltip.

#### `interface` [Tooltip](#view.Tooltip)

Describes a tooltip. Values of this type, when provided through the [`showTooltip`](#view.showTooltip) facet, control the individual tooltips on the editor.

`**[pos](#view.Tooltip.pos)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The document position at which to show the tooltip.

`**[end](#view.Tooltip.end)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the range annotated by this tooltip, if different from `pos`.

`**[create](#view.Tooltip.create)**([view](#view.Tooltip.create^view): [EditorView](#view.EditorView)) → [TooltipView](#view.TooltipView)`

A constructor function that creates the tooltip's [DOM representation](#view.TooltipView).

`**[above](#view.Tooltip.above)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the tooltip should be shown above or below the target position. Not guaranteed to be respected for hover tooltips since all hover tooltips for the same range are always positioned together. Defaults to false.

`**[strictSide](#view.Tooltip.strictSide)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the `above` option should be honored when there isn't enough space on that side to show the tooltip inside the viewport. Defaults to false.

`**[arrow](#view.Tooltip.arrow)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When set to true, show a triangle connecting the tooltip element to position `pos`.

`**[clip](#view.Tooltip.clip)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, tooltips are hidden when their position is outside of the visible editor content. Set this to false to turn that off.

#### `interface` [TooltipView](#view.TooltipView)

Describes the way a tooltip is displayed.

`**[dom](#view.TooltipView.dom)**: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The DOM element to position over the editor.

`**[offset](#view.TooltipView.offset)**⁠?: {x: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), y: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

Adjust the position of the tooltip relative to its anchor position. A positive `x` value will move the tooltip horizontally along with the text direction (so right in left-to-right context, left in right-to-left). A positive `y` will move the tooltip up when it is above its anchor, and down otherwise.

`**[getCoords](#view.TooltipView.getCoords)**⁠?: fn([pos](#view.TooltipView.getCoords^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [Rect](#view.Rect)`

By default, a tooltip's screen position will be based on the text position of its `pos` property. This method can be provided to make the tooltip view itself responsible for finding its screen position.

`**[overlap](#view.TooltipView.overlap)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, tooltips are moved when they overlap with other tooltips. Set this to `true` to disable that behavior for this tooltip.

`**[mount](#view.TooltipView.mount)**⁠?: fn([view](#view.TooltipView.mount^view): [EditorView](#view.EditorView))`

Called after the tooltip is added to the DOM for the first time.

`**[update](#view.TooltipView.update)**⁠?: fn([update](#view.TooltipView.update^update): [ViewUpdate](#view.ViewUpdate))`

Update the DOM element for a change in the view's state.

`**[destroy](#view.TooltipView.destroy)**⁠?: fn()`

Called when the tooltip is removed from the editor or the editor is destroyed.

`**[positioned](#view.TooltipView.positioned)**⁠?: fn([space](#view.TooltipView.positioned^space): [Rect](#view.Rect))`

Called when the tooltip has been (re)positioned. The argument is the [space](#view.tooltips%5Econfig.tooltipSpace) available to the tooltip.

`**[resize](#view.TooltipView.resize)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, the library will restrict the size of tooltips so that they don't stick out of the available space. Set this to false to disable that.

`**[tooltips](#view.tooltips)**([config](#view.tooltips^config)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [Extension](#state.Extension)`

Creates an extension that configures tooltip behavior.

`**[config](#view.tooltips^config)**`

`**[position](#view.tooltips^config.position)**⁠?: "fixed" | "absolute"`

By default, tooltips use `"fixed"` [positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/position), which has the advantage that tooltips don't get cut off by scrollable parent elements. However, CSS rules like `contain: layout` can break fixed positioning in child nodes, which can be worked about by using `"absolute"` here.

On iOS, which at the time of writing still doesn't properly support fixed positioning, the library always uses absolute positioning.

If the tooltip parent element sits in a transformed element, the library also falls back to absolute positioning.

`**[parent](#view.tooltips^config.parent)**⁠?: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The element to put the tooltips into. By default, they are put in the editor (`cm-editor`) element, and that is usually what you want. But in some layouts that can lead to positioning issues, and you need to use a different parent to work around those.

`**[tooltipSpace](#view.tooltips^config.tooltipSpace)**⁠?: fn([view](#view.tooltips^config.tooltipSpace^view): [EditorView](#view.EditorView)) → [Rect](#view.Rect)`

By default, when figuring out whether there is room for a tooltip at a given position, the extension considers the entire space between 0,0 and `documentElement.clientWidth`/`clientHeight` to be available for showing tooltips. You can provide a function here that returns an alternative rectangle.

`**[getTooltip](#view.getTooltip)**([view](#view.getTooltip^view): [EditorView](#view.EditorView), [tooltip](#view.getTooltip^tooltip): [Tooltip](#view.Tooltip)) → [TooltipView](#view.TooltipView) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the active tooltip view for a given tooltip, if available.

`**[hoverTooltip](#view.hoverTooltip)**([source](#view.hoverTooltip^source): [HoverTooltipSource](#view.HoverTooltipSource), [options](#view.hoverTooltip^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → {extension: [Extension](#state.Extension)} &  {active: [StateField](#state.StateField)<readonly [Tooltip](#view.Tooltip)[]>}  |  readonly [Extension](#state.Extension)[] &  {active: [StateField](#state.StateField)<readonly [Tooltip](#view.Tooltip)[]>}    `

Set up a hover tooltip, which shows up when the pointer hovers over ranges of text. The callback is called when the mouse hovers over the document text. It should, if there is a tooltip associated with position `pos`, return the tooltip description (either directly or in a promise). The `side` argument indicates on which side of the position the pointer is—it will be -1 if the pointer is before the position, 1 if after the position.

Note that all hover tooltips are hosted within a single tooltip container element. This allows multiple tooltips over the same range to be "merged" together without overlapping.

The return value is a valid [editor extension](#state.Extension) but also provides an `active` property holding a state field that can be used to read the currently active tooltips produced by this extension.

`**[options](#view.hoverTooltip^options)**`

`**[hideOn](#view.hoverTooltip^options.hideOn)**⁠?: fn([tr](#view.hoverTooltip^options.hideOn^tr): [Transaction](#state.Transaction), [tooltip](#view.hoverTooltip^options.hideOn^tooltip): [Tooltip](#view.Tooltip)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Controls whether a transaction hides the tooltip. The default is to not hide.

`**[hideOnChange](#view.hoverTooltip^options.hideOnChange)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | "touch"`

When enabled (this defaults to false), close the tooltip whenever the document changes or the selection is set.

`**[hoverTime](#view.hoverTooltip^options.hoverTime)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Hover time after which the tooltip should appear, in milliseconds. Defaults to 300ms.

`type **[HoverTooltipSource](#view.HoverTooltipSource)** = fn([view](#view.HoverTooltipSource^view): [EditorView](#view.EditorView), [pos](#view.HoverTooltipSource^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [side](#view.HoverTooltipSource^side): -1 | 1) → [Tooltip](#view.Tooltip) |  readonly [Tooltip](#view.Tooltip)[] |  [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Tooltip](#view.Tooltip) | readonly [Tooltip](#view.Tooltip)[] | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)> |  [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  `

The type of function that can be used as a [hover tooltip source](#view.hoverTooltip%5Esource).

`**[hasHoverTooltips](#view.hasHoverTooltips)**([state](#view.hasHoverTooltips^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns true if any hover tooltips are currently active.

`**[activateHover](#view.activateHover)**(  [view](#view.activateHover^view): [EditorView](#view.EditorView),  [pos](#view.activateHover^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [side](#view.activateHover^side): -1 | 1,  [options](#view.activateHover^options)⁠?: {tooltip⁠?: [Extension](#state.Extension), until⁠?: fn([tr](#view.activateHover^options.until^tr): [Transaction](#state.Transaction)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)} = {}  )`

Activate hover tooltips for the given position and side. If you provide a specific hover tooltip (the value returned from [`hoverTooltip`](#view.hoverTooltip)), only that one will be activated. If not given, all hover tooltips at the given position are triggered.

Note that tooltips opened this way don't close automatically, and you'll want to pass an `until` callback or use [`closeHoverTooltip`](#view.closeHoverTooltip)/[`closeHoverTooltips`](#view.closeHoverTooltips) to deactivate them.

`**[closeHoverTooltips](#view.closeHoverTooltips)**: [StateEffect](#state.StateEffect)<unknown>`

Transaction effect that closes all hover tooltips.

`**[closeHoverTooltip](#view.closeHoverTooltip)**(  [tooltip](#view.closeHoverTooltip^tooltip): [Extension](#state.Extension) |  {active: [StateField](#state.StateField)<readonly [Tooltip](#view.Tooltip)[]>}  ) → [StateEffect](#state.StateEffect)<unknown>`

Transaction effect that closes a specific hover tooltip.

`**[repositionTooltips](#view.repositionTooltips)**([view](#view.repositionTooltips^view): [EditorView](#view.EditorView))`

Tell the tooltip extension to recompute the position of the active tooltips. This can be useful when something happens (such as a re-positioning or CSS change affecting the editor) that could invalidate the existing tooltip positions.

### Panels

Panels are UI elements positioned above or below the editor (things like a search dialog). They will take space from the editor when it has a fixed height, and will stay in view even when the editor is partially scrolled out of view.

See also the [panel example](../../examples/panel/).

`**[showPanel](#view.showPanel)**: [Facet](#state.Facet)<[PanelConstructor](#view.PanelConstructor) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

Opening a panel is done by providing a constructor function for the panel through this facet. (The panel is closed again when its constructor is no longer provided.) Values of `null` are ignored.

`type **[PanelConstructor](#view.PanelConstructor)** = fn([view](#view.PanelConstructor^view): [EditorView](#view.EditorView)) → [Panel](#view.Panel)`

A function that initializes a panel. Used in [`showPanel`](#view.showPanel).

#### `interface` [Panel](#view.Panel)

Object that describes an active panel.

`**[dom](#view.Panel.dom)**: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The element representing this panel. The library will add the `"cm-panel"` DOM class to this.

`**[mount](#view.Panel.mount)**⁠?: fn()`

Optionally called after the panel has been added to the editor.

`**[update](#view.Panel.update)**⁠?: fn([update](#view.Panel.update^update): [ViewUpdate](#view.ViewUpdate))`

Update the DOM for a given view update.

`**[destroy](#view.Panel.destroy)**⁠?: fn()`

Called when the panel is removed from the editor or the editor is destroyed.

`**[top](#view.Panel.top)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the panel should be at the top or bottom of the editor. Defaults to false.

`**[getPanel](#view.getPanel)**([view](#view.getPanel^view): [EditorView](#view.EditorView), [panel](#view.getPanel^panel): [PanelConstructor](#view.PanelConstructor)) → [Panel](#view.Panel) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the active panel created by the given constructor, if any. This can be useful when you need access to your panels' DOM structure.

`**[panels](#view.panels)**([config](#view.panels^config)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [Extension](#state.Extension)`

Configures the panel-managing extension.

`**[config](#view.panels^config)**`

`**[topContainer](#view.panels^config.topContainer)**⁠?: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

By default, panels will be placed inside the editor's DOM structure. You can use this option to override where panels with `top: true` are placed.

`**[bottomContainer](#view.panels^config.bottomContainer)**⁠?: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

Override where panels with `top: false` are placed.

`**[showDialog](#view.showDialog)**([view](#view.showDialog^view): [EditorView](#view.EditorView), [config](#view.showDialog^config): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → {  close: [StateEffect](#state.StateEffect)<unknown>,  result: [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[HTMLFormElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>  }`

Show a panel above or below the editor to show the user a message or prompt them for input. Returns an effect that can be dispatched to close the dialog, and a promise that resolves when the dialog is closed or a form inside of it is submitted.

You are encouraged, if your handling of the result of the promise dispatches a transaction, to include the `close` effect in it. If you don't, this function will automatically dispatch a separate transaction right after.

`**[config](#view.showDialog^config)**`

`**[content](#view.showDialog^config.content)**⁠?: fn([view](#view.showDialog^config.content^view): [EditorView](#view.EditorView), [close](#view.showDialog^config.content^close): fn()) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

A function to render the content of the dialog. The result should contain at least one `<form>` element. Submit handlers and a handler for the Escape key will be added to the form.

If this is not given, the `label`, `input`, and `submitLabel` fields will be used to create a simple form for you.

`**[label](#view.showDialog^config.label)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

When `content` isn't given, this provides the text shown in the dialog.

`**[input](#view.showDialog^config.input)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

The attributes for an input element shown next to the label. If not given, no input element is added.

`**[submitLabel](#view.showDialog^config.submitLabel)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The label for the button that submits the form. Defaults to `"OK"`.

`**[class](#view.showDialog^config.class)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Extra classes to add to the panel.

`**[focus](#view.showDialog^config.focus)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

A query selector to find the field that should be focused when the dialog is opened. When set to true, this picks the first `<input>` or `<button>` element in the form.

`**[top](#view.showDialog^config.top)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, dialogs are shown below the editor. Set this to `true` to have it show up at the top.

`**[getDialog](#view.getDialog)**([view](#view.getDialog^view): [EditorView](#view.EditorView), [className](#view.getDialog^className): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Panel](#view.Panel) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Find the [`Panel`](#view.Panel) for an open dialog, using a class name as identifier.

### Layers

Layers are sets of DOM elements drawn over or below the document text. They can be useful for displaying user interface elements that don't take up space and shouldn't influence line wrapping, such as additional cursors.

Note that, being outside of the regular DOM order, such elements are invisible to screen readers. Make sure to also [provide](#view.EditorView%5Eannounce) any important information they convey in an accessible way.

`**[layer](#view.layer)**([config](#view.layer^config): Object) → [Extension](#state.Extension)`

Define a layer.

`**[config](#view.layer^config)**`

`**[above](#view.layer^config.above)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Determines whether this layer is shown above or below the text.

`**[class](#view.layer^config.class)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

When given, this class is added to the DOM element that will wrap the markers.

`**[update](#view.layer^config.update)**([update](#view.layer^config.update^update): [ViewUpdate](#view.ViewUpdate), [layer](#view.layer^config.update^layer): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Called on every view update. Returning true triggers a marker update (a call to `markers` and drawing of those markers).

`**[updateOnDocViewUpdate](#view.layer^config.updateOnDocViewUpdate)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether to update this layer every time the document view changes. Defaults to true.

`**[markers](#view.layer^config.markers)**([view](#view.layer^config.markers^view): [EditorView](#view.EditorView)) → readonly [LayerMarker](#view.LayerMarker)[]`

Build a set of markers for this layer, and measure their dimensions.

`**[mount](#view.layer^config.mount)**⁠?: fn([layer](#view.layer^config.mount^layer): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement), [view](#view.layer^config.mount^view): [EditorView](#view.EditorView))`

If given, this is called when the layer is created.

`**[destroy](#view.layer^config.destroy)**⁠?: fn([layer](#view.layer^config.destroy^layer): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement), [view](#view.layer^config.destroy^view): [EditorView](#view.EditorView))`

If given, called when the layer is removed from the editor or the entire editor is destroyed.

#### `interface` [LayerMarker](#view.LayerMarker)

Markers shown in a [layer](#view.layer) must conform to this interface. They are created in a measuring phase, and have to contain all their positioning information, so that they can be drawn without further DOM layout reading.

Markers are automatically absolutely positioned. Their parent element has the same top-left corner as the document, so they should be positioned relative to the document.

`**[eq](#view.LayerMarker.eq)**([other](#view.LayerMarker.eq^other): [LayerMarker](#view.LayerMarker)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this marker to a marker of the same type. Used to avoid unnecessary redraws.

`**[draw](#view.LayerMarker.draw)**() → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

Draw the marker to the DOM.

`**[update](#view.LayerMarker.update)**⁠?: fn([dom](#view.LayerMarker.update^dom): [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement), [oldMarker](#view.LayerMarker.update^oldMarker): [LayerMarker](#view.LayerMarker)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Update an existing marker of this type to this marker.

#### `class` [RectangleMarker](#view.RectangleMarker) `implements [LayerMarker](#view.LayerMarker)`

Implementation of [`LayerMarker`](#view.LayerMarker) that creates a rectangle at a given set of coordinates.

`new **[RectangleMarker](#view.RectangleMarker.constructor)**(  [className](#view.RectangleMarker.constructor^className): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [left](#view.RectangleMarker.constructor^left): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [top](#view.RectangleMarker.constructor^top): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [width](#view.RectangleMarker.constructor^width): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null),  [height](#view.RectangleMarker.constructor^height): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  )`

Create a marker with the given class and dimensions. If `width` is null, the DOM element will get no width style.

`**[left](#view.RectangleMarker.left)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The left position of the marker (in pixels, document-relative).

`**[top](#view.RectangleMarker.top)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The top position of the marker.

`**[width](#view.RectangleMarker.width)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

The width of the marker, or null if it shouldn't get a width assigned.

`**[height](#view.RectangleMarker.height)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The height of the marker.

`static **[forRange](#view.RectangleMarker^forRange)**(  [view](#view.RectangleMarker^forRange^view): [EditorView](#view.EditorView),  [className](#view.RectangleMarker^forRange^className): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [range](#view.RectangleMarker^forRange^range): [SelectionRange](#state.SelectionRange)  ) → readonly [RectangleMarker](#view.RectangleMarker)[]`

Create a set of rectangles for the given selection range, assigning them theclass`className`. Will create a single rectangle for empty ranges, and a set of selection-style rectangles covering the range's content (in a bidi-aware way) for non-empty ones.

### Rectangular Selection

`**[rectangularSelection](#view.rectangularSelection)**([options](#view.rectangularSelection^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [Extension](#state.Extension)`

Create an extension that enables rectangular selections. By default, it will react to left mouse drag with the Alt key held down. When such a selection occurs, the text within the rectangle that was dragged over will be selected, as one selection [range](#state.SelectionRange) per line.

`**[options](#view.rectangularSelection^options)**`

`**[eventFilter](#view.rectangularSelection^options.eventFilter)**⁠?: fn([event](#view.rectangularSelection^options.eventFilter^event): [MouseEvent](https://developer.mozilla.org/en/docs/DOM/MouseEvent)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

A custom predicate function, which takes a `mousedown` event and returns true if it should be used for rectangular selection.

`**[crosshairCursor](#view.crosshairCursor)**(  [options](#view.crosshairCursor^options)⁠?: {key⁠?: "Alt" | "Control" | "Shift" | "Meta"} = {}  ) → [Extension](#state.Extension)`

Returns an extension that turns the pointer cursor into a crosshair when a given modifier key, defaulting to Alt, is held down. Can serve as a visual hint that rectangular selection is going to happen when paired with [`rectangularSelection`](#view.rectangularSelection).

## [@codemirror/language](#language)

`**[languageDataProp](#language.languageDataProp)**: [NodeProp](https://lezer.codemirror.net/docs/ref/#common.NodeProp)<[Facet](#state.Facet)<[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>>>`

Node prop stored in a parser's top syntax node to provide the facet that stores language-specific data for that language.

#### `class` [Language](#language.Language)

A language object manages parsing and per-language [metadata](#state.EditorState.languageDataAt). Parse data is managed as a [Lezer](https://lezer.codemirror.net) tree. The class can be used directly, via the [`LRLanguage`](#language.LRLanguage) subclass for [Lezer](https://lezer.codemirror.net/) LR parsers, or via the [`StreamLanguage`](#language.StreamLanguage) subclass for stream parsers.

`new **[Language](#language.Language.constructor)**(  [data](#language.Language.constructor^data): [Facet](#state.Facet)<[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>>,  [parser](#language.Language.constructor^parser): [Parser](https://lezer.codemirror.net/docs/ref/#common.Parser),  [extraExtensions](#language.Language.constructor^extraExtensions)⁠?: [Extension](#state.Extension)[] = [],  [name](#language.Language.constructor^name)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) = ""  )`

Construct a language object. If you need to invoke this directly, first define a data facet with [`defineLanguageFacet`](#language.defineLanguageFacet), and then configure your parser to [attach](#language.languageDataProp) it to the language's outer syntax node.

`**[extension](#language.Language.extension)**: [Extension](#state.Extension)`

The extension value to install this as the document language.

`**[parser](#language.Language.parser)**: [Parser](https://lezer.codemirror.net/docs/ref/#common.Parser)`

The parser object. Can be useful when using this as a [nested parser](https://lezer.codemirror.net/docs/ref#common.Parser).

`**[data](#language.Language.data)**: [Facet](#state.Facet)<[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>>`

The [language data](#state.EditorState.languageDataAt) facet used for this language.

`**[name](#language.Language.name)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

A language name.

`**[isActiveAt](#language.Language.isActiveAt)**(  [state](#language.Language.isActiveAt^state): [EditorState](#state.EditorState),  [pos](#language.Language.isActiveAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [side](#language.Language.isActiveAt^side)⁠?: -1 | 0 | 1 = -1  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Query whether this language is active at the given position.

`**[findRegions](#language.Language.findRegions)**([state](#language.Language.findRegions^state): [EditorState](#state.EditorState)) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}[]`

Find the document regions that were parsed using this language. The returned regions will _include_ any nested languages rooted in this language, when those exist.

`**[allowsNesting](#language.Language.allowsNesting)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether this language allows nested languages. The default implementation returns true.

`**[defineLanguageFacet](#language.defineLanguageFacet)**([baseData](#language.defineLanguageFacet^baseData)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>) → [Facet](#state.Facet)<[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>>`

Helper function to define a facet (to be added to the top syntax node(s) for a language via [`languageDataProp`](#language.languageDataProp)), that will be used to associate language data with the language. You probably only need this when subclassing [`Language`](#language.Language).

#### `interface` [Sublanguage](#language.Sublanguage)

Some languages need to return different [language data](#state.EditorState.languageDataAt) for some parts of their tree. Sublanguages, registered by adding a [node prop](#language.sublanguageProp) to the language's top syntax node, provide a mechanism to do this.

(Note that when using nested parsing, where nested syntax is parsed by a different parser and has its own top node type, you don't need a sublanguage.)

`**[type](#language.Sublanguage.type)**⁠?: "replace" | "extend"`

Determines whether the data provided by this sublanguage should completely replace the regular data or be added to it (with higher-precedence). The default is `"extend"`.

`**[test](#language.Sublanguage.test)**([node](#language.Sublanguage.test^node): [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode), [state](#language.Sublanguage.test^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

A predicate that returns whether the node at the queried position is part of the sublanguage.

`**[facet](#language.Sublanguage.facet)**: [Facet](#state.Facet)<[Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>>`

The language data facet that holds the sublanguage's data. You'll want to use [`defineLanguageFacet`](#language.defineLanguageFacet) to create this.

`**[sublanguageProp](#language.sublanguageProp)**: [NodeProp](https://lezer.codemirror.net/docs/ref/#common.NodeProp)<[Sublanguage](#language.Sublanguage)[]>`

Syntax node prop used to register sublanguages. Should be added to the top level node type for the language.

`**[language](#language.language)**: [Facet](#state.Facet)<[Language](#language.Language), [Language](#language.Language) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

The facet used to associate a language with an editor state. Used by `Language` object's `extension` property (so you don't need to manually wrap your languages in this). Can be used to access the current language on a state.

#### `class` [LRLanguage](#language.LRLanguage) `extends [Language](#language.Language)`

A subclass of [`Language`](#language.Language) for use with Lezer [LR parsers](https://lezer.codemirror.net/docs/ref#lr.LRParser).

`**[configure](#language.LRLanguage.configure)**([options](#language.LRLanguage.configure^options): [ParserConfig](https://lezer.codemirror.net/docs/ref/#lr.ParserConfig), [name](#language.LRLanguage.configure^name)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [LRLanguage](#language.LRLanguage)`

Create a new instance of this language with a reconfigured version of its parser and optionally a new name.

`static **[define](#language.LRLanguage^define)**([spec](#language.LRLanguage^define^spec): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [LRLanguage](#language.LRLanguage)`

Define a language from a parser.

`**[spec](#language.LRLanguage^define^spec)**`

`**[name](#language.LRLanguage^define^spec.name)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The [name](#Language.name) of the language.

`**[parser](#language.LRLanguage^define^spec.parser)**: [LRParser](https://lezer.codemirror.net/docs/ref/#lr.LRParser)`

The parser to use. Should already have added editor-relevant node props (and optionally things like dialect and top rule) configured.

`**[languageData](#language.LRLanguage^define^spec.languageData)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>`

[Language data](#state.EditorState.languageDataAt) to register for this language.

#### `class` [ParseContext](#language.ParseContext)

A parse context provided to parsers working on the editor content.

`**[state](#language.ParseContext.state)**: [EditorState](#state.EditorState)`

The current editor state.

`**[fragments](#language.ParseContext.fragments)**: readonly [TreeFragment](https://lezer.codemirror.net/docs/ref/#common.TreeFragment)[]`

Tree fragments that can be reused by incremental re-parses.

`**[viewport](#language.ParseContext.viewport)**: {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

The current editor viewport (or some overapproximation thereof). Intended to be used for opportunistically avoiding work (in which case [`skipUntilInView`](#language.ParseContext.skipUntilInView) should be called to make sure the parser is restarted when the skipped region becomes visible).

`**[skipUntilInView](#language.ParseContext.skipUntilInView)**([from](#language.ParseContext.skipUntilInView^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#language.ParseContext.skipUntilInView^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

Notify the parse scheduler that the given region was skipped because it wasn't in view, and the parse should be restarted when it comes into view.

`static **[getSkippingParser](#language.ParseContext^getSkippingParser)**([until](#language.ParseContext^getSkippingParser^until)⁠?: [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<unknown>) → [Parser](https://lezer.codemirror.net/docs/ref/#common.Parser)`

Returns a parser intended to be used as placeholder when asynchronously loading a nested parser. It'll skip its input and mark it as not-really-parsed, so that the next update will parse it again.

When `until` is given, a reparse will be scheduled when that promise resolves.

`static **[get](#language.ParseContext^get)**() → [ParseContext](#language.ParseContext) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the context for the current parse, or `null` if no editor parse is in progress.

`**[syntaxTree](#language.syntaxTree)**([state](#language.syntaxTree^state): [EditorState](#state.EditorState)) → [Tree](https://lezer.codemirror.net/docs/ref/#common.Tree)`

Get the syntax tree for a state, which is the current (possibly incomplete) parse tree of the active [language](#language.Language), or the empty tree if there is no language available.

`**[ensureSyntaxTree](#language.ensureSyntaxTree)**([state](#language.ensureSyntaxTree^state): [EditorState](#state.EditorState), [upto](#language.ensureSyntaxTree^upto): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [timeout](#language.ensureSyntaxTree^timeout)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 50) → [Tree](https://lezer.codemirror.net/docs/ref/#common.Tree) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Try to get a parse tree that spans at least up to `upto`. The method will do at most `timeout` milliseconds of work to parse up to that point if the tree isn't already available.

`**[syntaxTreeAvailable](#language.syntaxTreeAvailable)**([state](#language.syntaxTreeAvailable^state): [EditorState](#state.EditorState), [upto](#language.syntaxTreeAvailable^upto)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = state.doc.length) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Queries whether there is a full syntax tree available up to the given document position. If there isn't, the background parse process _might_ still be working and update the tree further, but there is no guarantee of that—the parser will [stop working](#language.syntaxParserRunning) when it has spent a certain amount of time or has moved beyond the visible viewport. Always returns false if no language has been enabled.

`**[forceParsing](#language.forceParsing)**(  [view](#language.forceParsing^view): [EditorView](#view.EditorView),  [upto](#language.forceParsing^upto)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = view.viewport.to,  [timeout](#language.forceParsing^timeout)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 100  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Move parsing forward, and update the editor state afterwards to reflect the new tree. Will work for at most `timeout` milliseconds. Returns true if the parser managed get to the given position in that time.

`**[syntaxParserRunning](#language.syntaxParserRunning)**([view](#language.syntaxParserRunning^view): [EditorView](#view.EditorView)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Tells you whether the language parser is planning to do more parsing work (in a `requestIdleCallback` pseudo-thread) or has stopped running, either because it parsed the entire document, because it spent too much time and was cut off, or because there is no language parser enabled.

#### `class` [LanguageSupport](#language.LanguageSupport)

This class bundles a [language](#language.Language) with an optional set of supporting extensions. Language packages are encouraged to export a function that optionally takes a configuration object and returns a `LanguageSupport` instance, as the main way for client code to use the package.

`new **[LanguageSupport](#language.LanguageSupport.constructor)**([language](#language.LanguageSupport.constructor^language): [Language](#language.Language), [support](#language.LanguageSupport.constructor^support)⁠?: [Extension](#state.Extension) = [])`

Create a language support object.

`**[extension](#language.LanguageSupport.extension)**: [Extension](#state.Extension)`

An extension including both the language and its support extensions. (Allowing the object to be used as an extension value itself.)

`**[language](#language.LanguageSupport.language)**: [Language](#language.Language)`

The language object.

`**[support](#language.LanguageSupport.support)**: [Extension](#state.Extension)`

An optional set of supporting extensions. When nesting a language in another language, the outer language is encouraged to include the supporting extensions for its inner languages in its own set of support extensions.

#### `class` [LanguageDescription](#language.LanguageDescription)

Language descriptions are used to store metadata about languages and to dynamically load them. Their main role is finding the appropriate language for a filename or dynamically loading nested parsers.

`**[name](#language.LanguageDescription.name)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The name of this language.

`**[alias](#language.LanguageDescription.alias)**: readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

Alternative names for the mode (lowercased, includes `this.name`).

`**[extensions](#language.LanguageDescription.extensions)**: readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

File extensions associated with this language.

`**[filename](#language.LanguageDescription.filename)**: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Optional filename pattern that should be associated with this language.

`**[support](#language.LanguageDescription.support)**: [LanguageSupport](#language.LanguageSupport) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

If the language has been loaded, this will hold its value.

`**[load](#language.LanguageDescription.load)**() → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[LanguageSupport](#language.LanguageSupport)>`

Start loading the the language. Will return a promise that resolves to a [`LanguageSupport`](#language.LanguageSupport) object when the language successfully loads.

`static **[of](#language.LanguageDescription^of)**([spec](#language.LanguageDescription^of^spec): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [LanguageDescription](#language.LanguageDescription)`

Create a language description.

`**[spec](#language.LanguageDescription^of^spec)**`

`**[name](#language.LanguageDescription^of^spec.name)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The language's name.

`**[alias](#language.LanguageDescription^of^spec.alias)**⁠?: readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

An optional array of alternative names.

`**[extensions](#language.LanguageDescription^of^spec.extensions)**⁠?: readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

An optional array of filename extensions associated with this language.

`**[filename](#language.LanguageDescription^of^spec.filename)**⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)`

An optional filename pattern associated with this language.

`**[load](#language.LanguageDescription^of^spec.load)**⁠?: fn() → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[LanguageSupport](#language.LanguageSupport)>`

A function that will asynchronously load the language.

`**[support](#language.LanguageDescription^of^spec.support)**⁠?: [LanguageSupport](#language.LanguageSupport)`

Alternatively to `load`, you can provide an already loaded support object. Either this or `load` should be provided.

`static **[matchFilename](#language.LanguageDescription^matchFilename)**(  [descs](#language.LanguageDescription^matchFilename^descs): readonly [LanguageDescription](#language.LanguageDescription)[],  [filename](#language.LanguageDescription^matchFilename^filename): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)  ) → [LanguageDescription](#language.LanguageDescription) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Look for a language in the given array of descriptions that matches the filename. Will first match [`filename`](#language.LanguageDescription.filename) patterns, and then [extensions](#language.LanguageDescription.extensions), and return the first language that matches.

`static **[matchLanguageName](#language.LanguageDescription^matchLanguageName)**(  [descs](#language.LanguageDescription^matchLanguageName^descs): readonly [LanguageDescription](#language.LanguageDescription)[],  [name](#language.LanguageDescription^matchLanguageName^name): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [fuzzy](#language.LanguageDescription^matchLanguageName^fuzzy)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = true  ) → [LanguageDescription](#language.LanguageDescription) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Look for a language whose name or alias matches the the given name (case-insensitively). If `fuzzy` is true, and no direct matchs is found, this'll also search for a language whose name or alias occurs in the string (for names shorter than three characters, only when surrounded by non-word characters).

#### `class` [DocInput](#language.DocInput) `implements [Input](https://lezer.codemirror.net/docs/ref/#common.Input)`

Lezer-style [`Input`](https://lezer.codemirror.net/docs/ref#common.Input) object for a [`Text`](#state.Text) object.

`new **[DocInput](#language.DocInput.constructor)**([doc](#language.DocInput.constructor^doc): [Text](#state.Text))`

Create an input object for the given document.

`**[doc](#language.DocInput.doc)**: [Text](#state.Text)`

### Highlighting

#### `class` [HighlightStyle](#language.HighlightStyle) `implements [Highlighter](https://lezer.codemirror.net/docs/ref/#highlight.Highlighter)`

A highlight style associates CSS styles with highlighting [tags](https://lezer.codemirror.net/docs/ref#highlight.Tag).

`**[module](#language.HighlightStyle.module)**: [StyleModule](https://code.haverbeke.berlin/marijn/style-mod#documentation) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

A style module holding the CSS rules for this highlight style. When using [`highlightTree`](https://lezer.codemirror.net/docs/ref#highlight.highlightTree) outside of the editor, you may want to manually mount this module to show the highlighting.

`**[specs](#language.HighlightStyle.specs)**: readonly [TagStyle](#language.TagStyle)[]`

The tag styles used to create this highlight style.

`static **[define](#language.HighlightStyle^define)**([specs](#language.HighlightStyle^define^specs): readonly [TagStyle](#language.TagStyle)[], [options](#language.HighlightStyle^define^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [HighlightStyle](#language.HighlightStyle)`

Create a highlighter style that associates the given styles to the given tags. The specs must be objects that hold a style tag or array of tags in their `tag` property, and either a single `class` property providing a static CSS class (for highlighter that rely on external styling), or a [`style-mod`](https://code.haverbeke.berlin/marijn/style-mod#documentation)\-style set of CSS properties (which define the styling for those tags).

The CSS rules created for a highlighter will be emitted in the order of the spec's properties. That means that for elements that have multiple tags associated with them, styles defined further down in the list will have a higher CSS precedence than styles defined earlier.

`**[options](#language.HighlightStyle^define^options)**`

`**[scope](#language.HighlightStyle^define^options.scope)**⁠?: [Language](#language.Language) | [NodeType](https://lezer.codemirror.net/docs/ref/#common.NodeType)`

By default, highlighters apply to the entire document. You can scope them to a single language by providing the language object or a language's top node type here.

`**[all](#language.HighlightStyle^define^options.all)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [StyleSpec](https://code.haverbeke.berlin/marijn/style-mod#documentation)`

Add a style to _all_ content. Probably only useful in combination with `scope`.

`**[themeType](#language.HighlightStyle^define^options.themeType)**⁠?: "dark" | "light"`

Specify that this highlight style should only be active then the theme is dark or light. By default, it is active regardless of theme.

`**[syntaxHighlighting](#language.syntaxHighlighting)**([highlighter](#language.syntaxHighlighting^highlighter): [Highlighter](https://lezer.codemirror.net/docs/ref/#highlight.Highlighter), [options](#language.syntaxHighlighting^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [Extension](#state.Extension)`

Wrap a highlighter in an editor extension that uses it to apply syntax highlighting to the editor content.

When multiple (non-fallback) styles are provided, the styling applied is the union of the classes they emit.

`**[options](#language.syntaxHighlighting^options)**`

`**[fallback](#language.syntaxHighlighting^options.fallback)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When enabled, this marks the highlighter as a fallback, which only takes effect if no other highlighters are registered.

#### `interface` [TagStyle](#language.TagStyle)

The type of object used in [`HighlightStyle.define`](#language.HighlightStyle%5Edefine). Assigns a style to one or more highlighting [tags](https://lezer.codemirror.net/docs/ref#highlight.Tag), which can either be a fixed class name (which must be defined elsewhere), or a set of CSS properties, for which the library will define an anonymous class.

`**[tag](#language.TagStyle.tag)**: [Tag](https://lezer.codemirror.net/docs/ref/#highlight.Tag) | readonly [Tag](https://lezer.codemirror.net/docs/ref/#highlight.Tag)[]`

The tag or tags to target.

`**[class](#language.TagStyle.class)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

If given, this maps the tags to a fixed class name.

`**[[string]](#language.TagStyle^string)**: any`

Any further properties (if `class` isn't given) will be interpreted as in style objects given to [style-mod](https://code.haverbeke.berlin/marijn/style-mod#documentation). (The type here is `any` because of TypeScript limitations.)

`**[defaultHighlightStyle](#language.defaultHighlightStyle)**: [HighlightStyle](#language.HighlightStyle)`

A default highlight style (works well with light themes).

`**[highlightingFor](#language.highlightingFor)**(  [state](#language.highlightingFor^state): [EditorState](#state.EditorState),  [tags](#language.highlightingFor^tags): readonly [Tag](https://lezer.codemirror.net/docs/ref/#highlight.Tag)[],  [scope](#language.highlightingFor^scope)⁠?: [NodeType](https://lezer.codemirror.net/docs/ref/#common.NodeType)  ) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Returns the CSS classes (if any) that the highlighters active in the state would assign to the given style [tags](https://lezer.codemirror.net/docs/ref#highlight.Tag) and (optional) language [scope](#language.HighlightStyle%5Edefine%5Eoptions.scope).

`**[bidiIsolates](#language.bidiIsolates)**([options](#language.bidiIsolates^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [Extension](#state.Extension)`

Make sure nodes [marked](https://lezer.codemirror.net/docs/ref/#common.NodeProp%5Eisolate) as isolating for bidirectional text are rendered in a way that isolates them from the surrounding text.

`**[options](#language.bidiIsolates^options)**`

`**[alwaysIsolate](#language.bidiIsolates^options.alwaysIsolate)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, isolating elements are only added when the editor direction isn't uniformly left-to-right, or if it is, on lines that contain right-to-left character. When true, disable this optimization and add them everywhere.

### Folding

These exports provide commands and other functionality related to code folding (temporarily hiding pieces of code).

`**[foldService](#language.foldService)**: [Facet](#state.Facet)<  fn([state](#language.foldService^state): [EditorState](#state.EditorState), [lineStart](#language.foldService^lineStart): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [lineEnd](#language.foldService^lineEnd): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

A facet that registers a code folding service. When called with the extent of a line, such a function should return a foldable range that starts on that line (but continues beyond it), if one can be found.

`**[foldNodeProp](#language.foldNodeProp)**: [NodeProp](https://lezer.codemirror.net/docs/ref/#common.NodeProp)<  fn([node](#language.foldNodeProp^node): [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode), [state](#language.foldNodeProp^state): [EditorState](#state.EditorState)) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  >`

This node prop is used to associate folding information with syntax node types. Given a syntax node, it should check whether that tree is foldable and return the range that can be collapsed when it is.

`**[foldInside](#language.foldInside)**([node](#language.foldInside^node): [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode)) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

[Fold](#language.foldNodeProp) function that folds everything but the first and the last child of a syntax node. Useful for nodes that start and end with delimiters.

`**[foldable](#language.foldable)**([state](#language.foldable^state): [EditorState](#state.EditorState), [lineStart](#language.foldable^lineStart): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [lineEnd](#language.foldable^lineEnd): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Check whether the given line is foldable. First asks any fold services registered through [`foldService`](#language.foldService), and if none of them return a result, tries to query the [fold node prop](#language.foldNodeProp) of syntax nodes that cover the end of the line.

`**[foldCode](#language.foldCode)**: [Command](#view.Command)`

Fold the lines that are selected, if possible.

`**[unfoldCode](#language.unfoldCode)**: [Command](#view.Command)`

Unfold folded ranges on selected lines.

`**[toggleFold](#language.toggleFold)**: [Command](#view.Command)`

Toggle folding at cursors. Unfolds if there is an existing fold starting in that line, tries to find a foldable range around it otherwise.

`**[foldAll](#language.foldAll)**: [Command](#view.Command)`

Fold all top-level foldable ranges. Note that, in most cases, folding information will depend on the [syntax tree](#language.syntaxTree), and folding everything may not work reliably when the document hasn't been fully parsed (either because the editor state was only just initialized, or because the document is so big that the parser decided not to parse it entirely).

`**[unfoldAll](#language.unfoldAll)**: [Command](#view.Command)`

Unfold all folded code.

`**[foldKeymap](#language.foldKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Default fold-related key bindings.

*   Ctrl-Shift-\[ (Cmd-Alt-\[ on macOS): [`foldCode`](#language.foldCode).
*   Ctrl-Shift-\] (Cmd-Alt-\] on macOS): [`unfoldCode`](#language.unfoldCode).
*   Ctrl-Alt-\[: [`foldAll`](#language.foldAll).
*   Ctrl-Alt-\]: [`unfoldAll`](#language.unfoldAll).

`**[codeFolding](#language.codeFolding)**([config](#language.codeFolding^config)⁠?: Object) → [Extension](#state.Extension)`

Create an extension that configures code folding.

`**[config](#language.codeFolding^config)**`

`**[placeholderDOM](#language.codeFolding^config.placeholderDOM)**⁠?: fn(  [view](#language.codeFolding^config.placeholderDOM^view): [EditorView](#view.EditorView),  [onclick](#language.codeFolding^config.placeholderDOM^onclick): fn([event](#language.codeFolding^config.placeholderDOM^onclick^event): [Event](https://developer.mozilla.org/en-US/docs/DOM/event)),  [prepared](#language.codeFolding^config.placeholderDOM^prepared): any  ) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

A function that creates the DOM element used to indicate the position of folded code. The `onclick` argument is the default click event handler, which toggles folding on the line that holds the element, and should probably be added as an event handler to the returned element. If [`preparePlaceholder`](#language.FoldConfig.preparePlaceholder) is given, its result will be passed as 3rd argument. Otherwise, this will be null.

When this option isn't given, the `placeholderText` option will be used to create the placeholder element.

`**[placeholderText](#language.codeFolding^config.placeholderText)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Text to use as placeholder for folded text. Defaults to `"…"`. Will be styled with the `"cm-foldPlaceholder"` class.

`**[preparePlaceholder](#language.codeFolding^config.preparePlaceholder)**⁠?: fn(  [state](#language.codeFolding^config.preparePlaceholder^state): [EditorState](#state.EditorState),  [range](#language.codeFolding^config.preparePlaceholder^range): {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}  ) → any`

Given a range that is being folded, create a value that describes it, to be used by `placeholderDOM` to render a custom widget that, for example, indicates something about the folded range's size or type.

`**[foldGutter](#language.foldGutter)**([config](#language.foldGutter^config)⁠?: Object = {}) → [Extension](#state.Extension)`

Create an extension that registers a fold gutter, which shows a fold status indicator before foldable lines (which can be clicked to fold or unfold the line).

`**[config](#language.foldGutter^config)**`

`**[markerDOM](#language.foldGutter^config.markerDOM)**⁠?: fn([open](#language.foldGutter^config.markerDOM^open): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

A function that creates the DOM element used to indicate a given line is folded or can be folded. When not given, the `openText`/`closeText` option will be used instead.

`**[openText](#language.foldGutter^config.openText)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Text used to indicate that a given line can be folded. Defaults to `"⌄"`.

`**[closedText](#language.foldGutter^config.closedText)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Text used to indicate that a given line is folded. Defaults to `"›"`.

`**[domEventHandlers](#language.foldGutter^config.domEventHandlers)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<  fn([view](#language.foldGutter^config.domEventHandlers^view): [EditorView](#view.EditorView), [line](#language.foldGutter^config.domEventHandlers^line): [BlockInfo](#view.BlockInfo), [event](#language.foldGutter^config.domEventHandlers^event): [Event](https://developer.mozilla.org/en-US/docs/DOM/event)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  >`

Supply event handlers for DOM events on this gutter.

`**[foldingChanged](#language.foldGutter^config.foldingChanged)**⁠?: fn([update](#language.foldGutter^config.foldingChanged^update): [ViewUpdate](#view.ViewUpdate)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When given, if this returns true for a given view update, recompute the fold markers.

The following functions provide more direct, low-level control over the fold state.

`**[foldedRanges](#language.foldedRanges)**([state](#language.foldedRanges^state): [EditorState](#state.EditorState)) → [DecorationSet](#view.DecorationSet)`

Get a [range set](#state.RangeSet) containing the folded ranges in the given state.

`**[foldState](#language.foldState)**: [StateField](#state.StateField)<[DecorationSet](#view.DecorationSet)>`

The state field that stores the folded ranges (as a [decoration set](#view.DecorationSet)). Can be passed to [`EditorState.toJSON`](#state.EditorState.toJSON) and [`fromJSON`](#state.EditorState%5EfromJSON) to serialize the fold state.

`**[foldEffect](#language.foldEffect)**: [StateEffectType](#state.StateEffectType)<{from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}>`

State effect that can be attached to a transaction to fold the given range. (You probably only need this in exceptional circumstances—usually you'll just want to let [`foldCode`](#language.foldCode) and the [fold gutter](#language.foldGutter) create the transactions.)

`**[unfoldEffect](#language.unfoldEffect)**: [StateEffectType](#state.StateEffectType)<{from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}>`

State effect that unfolds the given range (if it was folded).

### Indentation

`**[indentService](#language.indentService)**: [Facet](#state.Facet)<  fn([context](#language.indentService^context): [IndentContext](#language.IndentContext), [pos](#language.indentService^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)  >`

Facet that defines a way to provide a function that computes the appropriate indentation depth, as a column number (see [`indentString`](#language.indentString)), at the start of a given line. A return value of `null` indicates no indentation can be determined, and the line should inherit the indentation of the one above it. A return value of `undefined` defers to the next indent service.

`**[indentNodeProp](#language.indentNodeProp)**: [NodeProp](https://lezer.codemirror.net/docs/ref/#common.NodeProp)<fn([context](#language.indentNodeProp^context): [TreeIndentContext](#language.TreeIndentContext)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

A syntax tree node prop used to associate indentation strategies with node types. Such a strategy is a function from an indentation context to a column number (see also [`indentString`](#language.indentString)) or null, where null indicates that no definitive indentation can be determined.

`**[getIndentation](#language.getIndentation)**([context](#language.getIndentation^context): [IndentContext](#language.IndentContext) | [EditorState](#state.EditorState), [pos](#language.getIndentation^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the indentation, as a column number, at the given position. Will first consult any [indent services](#language.indentService) that are registered, and if none of those return an indentation, this will check the syntax tree for the [indent node prop](#language.indentNodeProp) and use that if found. Returns a number when an indentation could be determined, and null otherwise.

`**[indentRange](#language.indentRange)**([state](#language.indentRange^state): [EditorState](#state.EditorState), [from](#language.indentRange^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#language.indentRange^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [ChangeSet](#state.ChangeSet)`

Create a change set that auto-indents all lines touched by the given document range.

`**[indentUnit](#language.indentUnit)**: [Facet](#state.Facet)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)>`

Facet for overriding the unit by which indentation happens. Should be a string consisting entirely of the same whitespace character. When not set, this defaults to 2 spaces.

`**[getIndentUnit](#language.getIndentUnit)**([state](#language.getIndentUnit^state): [EditorState](#state.EditorState)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Return the _column width_ of an indent unit in the state. Determined by the [`indentUnit`](#language.indentUnit) facet, and [`tabSize`](#state.EditorState%5EtabSize) when that contains tabs.

`**[indentString](#language.indentString)**([state](#language.indentString^state): [EditorState](#state.EditorState), [cols](#language.indentString^cols): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Create an indentation string that covers columns 0 to `cols`. Will use tabs for as much of the columns as possible when the [`indentUnit`](#language.indentUnit) facet contains tabs.

#### `class` [IndentContext](#language.IndentContext)

Indentation contexts are used when calling [indentation services](#language.indentService). They provide helper utilities useful in indentation logic, and can selectively override the indentation reported for some lines.

`new **[IndentContext](#language.IndentContext.constructor)**([state](#language.IndentContext.constructor^state): [EditorState](#state.EditorState), [options](#language.IndentContext.constructor^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {})`

Create an indent context.

`**[options](#language.IndentContext.constructor^options)**`

`**[overrideIndentation](#language.IndentContext.constructor^options.overrideIndentation)**⁠?: fn([pos](#language.IndentContext.constructor^options.overrideIndentation^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Override line indentations provided to the indentation helper function, which is useful when implementing region indentation, where indentation for later lines needs to refer to previous lines, which may have been reindented compared to the original start state. If given, this function should return -1 for lines (given by start position) that didn't change, and an updated indentation otherwise.

`**[simulateBreak](#language.IndentContext.constructor^options.simulateBreak)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Make it look, to the indent logic, like a line break was added at the given position (which is mostly just useful for implementing something like [`insertNewlineAndIndent`](#commands.insertNewlineAndIndent)).

`**[simulateDoubleBreak](#language.IndentContext.constructor^options.simulateDoubleBreak)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When `simulateBreak` is given, this can be used to make the simulated break behave like a double line break.

`**[unit](#language.IndentContext.unit)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The indent unit (number of columns per indentation level).

`**[state](#language.IndentContext.state)**: [EditorState](#state.EditorState)`

The editor state.

`**[lineAt](#language.IndentContext.lineAt)**([pos](#language.IndentContext.lineAt^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [bias](#language.IndentContext.lineAt^bias)⁠?: -1 | 1 = 1) → {text: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

Get a description of the line at the given position, taking [simulated line breaks](#language.IndentContext.constructor%5Eoptions.simulateBreak) into account. If there is such a break at `pos`, the `bias` argument determines whether the part of the line line before or after the break is used.

`**[textAfterPos](#language.IndentContext.textAfterPos)**([pos](#language.IndentContext.textAfterPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [bias](#language.IndentContext.textAfterPos^bias)⁠?: -1 | 1 = 1) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Get the text directly after `pos`, either the entire line or the next 100 characters, whichever is shorter.

`**[column](#language.IndentContext.column)**([pos](#language.IndentContext.column^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [bias](#language.IndentContext.column^bias)⁠?: -1 | 1 = 1) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Find the column for the given position.

`**[countColumn](#language.IndentContext.countColumn)**([line](#language.IndentContext.countColumn^line): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [pos](#language.IndentContext.countColumn^pos)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = line.length) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Find the column position (taking tabs into account) of the given position in the given string.

`**[lineIndent](#language.IndentContext.lineIndent)**([pos](#language.IndentContext.lineIndent^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [bias](#language.IndentContext.lineIndent^bias)⁠?: -1 | 1 = 1) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Find the indentation column of the line at the given point.

`**[simulatedBreak](#language.IndentContext.simulatedBreak)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Returns the [simulated line break](#language.IndentContext.constructor%5Eoptions.simulateBreak) for this context, if any.

#### `class` [TreeIndentContext](#language.TreeIndentContext) `extends [IndentContext](#language.IndentContext)`

Objects of this type provide context information and helper methods to indentation functions registered on syntax nodes.

`**[pos](#language.TreeIndentContext.pos)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The position at which indentation is being computed.

`**[node](#language.TreeIndentContext.node)**: [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode)`

The syntax tree node to which the indentation strategy applies.

`**[textAfter](#language.TreeIndentContext.textAfter)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Get the text directly after `this.pos`, either the entire line or the next 100 characters, whichever is shorter.

`**[baseIndent](#language.TreeIndentContext.baseIndent)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Get the indentation at the reference line for `this.node`, which is the line on which it starts, unless there is a node that is _not_ a parent of this node covering the start of that line. If so, the line at the start of that node is tried, again skipping on if it is covered by another such node.

`**[baseIndentFor](#language.TreeIndentContext.baseIndentFor)**([node](#language.TreeIndentContext.baseIndentFor^node): [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Get the indentation for the reference line of the given node (see [`baseIndent`](#language.TreeIndentContext.baseIndent)).

`**[continue](#language.TreeIndentContext.continue)**() → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Continue looking for indentations in the node's parent nodes, and return the result of that.

`**[delimitedIndent](#language.delimitedIndent)**({closing: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), align⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), units⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}) → fn([context](#language.delimitedIndent^returns^context): [TreeIndentContext](#language.TreeIndentContext)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

An indentation strategy for delimited (usually bracketed) nodes. Will, by default, indent one unit more than the parent's base indent unless the line starts with a closing token. When `align` is true and there are non-skipped nodes on the node's opening line, the content of the node will be aligned with the end of the opening node, like this:

```
foo(bar,
    baz)
```

`**[continuedIndent](#language.continuedIndent)**({except⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp), units⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} = {}) → fn([context](#language.continuedIndent^returns^context): [TreeIndentContext](#language.TreeIndentContext)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Creates an indentation strategy that, by default, indents continued lines one unit more than the node's base indentation. You can provide `except` to prevent indentation of lines that match a pattern (for example `/^else\b/` in `if`/`else` constructs), and you can change the amount of units used with the `units` option.

`**[flatIndent](#language.flatIndent)**([context](#language.flatIndent^context): [TreeIndentContext](#language.TreeIndentContext)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

An indentation strategy that aligns a node's content to its base indentation.

`**[indentOnInput](#language.indentOnInput)**() → [Extension](#state.Extension)`

Enables reindentation on input. When a language defines an `indentOnInput` field in its [language data](#state.EditorState.languageDataAt), which must hold a regular expression, the line at the cursor will be reindented whenever new text is typed and the input from the start of the line up to the cursor matches that regexp.

To avoid unneccesary reindents, it is recommended to start the regexp with `^` (usually followed by `\s*`), and end it with `$`. For example, `/^\s*\}$/` will reindent when a closing brace is added at the start of a line.

### Bracket Matching

`**[bracketMatching](#language.bracketMatching)**([config](#language.bracketMatching^config)⁠?: [Config](#language.Config) = {}) → [Extension](#state.Extension)`

Create an extension that enables bracket matching. Whenever the cursor is next to a bracket, that bracket and the one it matches are highlighted. Or, when no matching bracket is found, another highlighting style is used to indicate this.

#### `interface` [Config](#language.Config)

`**[afterCursor](#language.Config.afterCursor)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the bracket matching should look at the character after the cursor when matching (if the one before isn't a bracket). Defaults to true.

`**[brackets](#language.Config.brackets)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The bracket characters to match, as a string of pairs. Defaults to `"()[]{}"`. Note that these are only used as fallback when there is no [matching information](https://lezer.codemirror.net/docs/ref/#common.NodeProp%5EclosedBy) in the syntax tree.

`**[maxScanDistance](#language.Config.maxScanDistance)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The maximum distance to scan for matching brackets. This is only relevant for brackets not encoded in the syntax tree. Defaults to 10 000.

`**[renderMatch](#language.Config.renderMatch)**⁠?: fn([match](#language.Config.renderMatch^match): [MatchResult](#language.MatchResult), [state](#language.Config.renderMatch^state): [EditorState](#state.EditorState)) → readonly [Range](#state.Range)<[Decoration](#view.Decoration)>[]`

Can be used to configure the way in which brackets are decorated. The default behavior is to add the `cm-matchingBracket` class for matching pairs, and `cm-nonmatchingBracket` for mismatched pairs or single brackets.

`**[matchBrackets](#language.matchBrackets)**(  [state](#language.matchBrackets^state): [EditorState](#state.EditorState),  [pos](#language.matchBrackets^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [dir](#language.matchBrackets^dir): -1 | 1,  [config](#language.matchBrackets^config)⁠?: [Config](#language.Config) = {}  ) → [MatchResult](#language.MatchResult) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Find the matching bracket for the token at `pos`, scanning direction `dir`. Only the `brackets` and `maxScanDistance` properties are used from `config`, if given. Returns null if no bracket was found at `pos`, or a match result otherwise.

#### `interface` [MatchResult](#language.MatchResult)

The result returned from `matchBrackets`.

`**[start](#language.MatchResult.start)**: {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

The extent of the bracket token found.

`**[end](#language.MatchResult.end)**⁠?: {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

The extent of the matched token, if any was found.

`**[matched](#language.MatchResult.matched)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the tokens match. This can be false even when `end` has a value, if that token doesn't match the opening token.

`**[bracketMatchingHandle](#language.bracketMatchingHandle)**: [NodeProp](https://lezer.codemirror.net/docs/ref/#common.NodeProp)<fn([node](#language.bracketMatchingHandle^node): [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode)) → [SyntaxNode](https://lezer.codemirror.net/docs/ref/#common.SyntaxNode) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

When larger syntax nodes, such as HTML tags, are marked as opening/closing, it can be a bit messy to treat the whole node as a matchable bracket. This node prop allows you to define, for such a node, a ‘handle’—the part of the node that is highlighted, and that the cursor must be on to activate highlighting in the first place.

### Stream Parser

Stream parsers provide a way to adapt language modes written in the CodeMirror 5 style (see [@codemirror/legacy-modes](https://code.haverbeke.berlin/codemirror/legacy-modes)) to the `Language` interface.

#### `class` [StreamLanguage](#language.StreamLanguage)`<[State](#language.StreamLanguage^State)>` `extends [Language](#language.Language)`

A [language](#language.Language) class based on a CodeMirror 5-style [streaming parser](#language.StreamParser).

`static **[define](#language.StreamLanguage^define)**<[State](#language.StreamLanguage^define^State)>([spec](#language.StreamLanguage^define^spec): [StreamParser](#language.StreamParser)<[State](#language.StreamLanguage^define^State)>) → [StreamLanguage](#language.StreamLanguage)<[State](#language.StreamLanguage^define^State)>`

Define a stream language.

#### `interface` [StreamParser](#language.StreamParser)`<[State](#language.StreamParser^State)>`

A stream parser parses or tokenizes content from start to end, emitting tokens as it goes over it. It keeps a mutable (but copyable) object with state, in which it can store information about the current context.

`**[name](#language.StreamParser.name)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

A name for this language.

`**[startState](#language.StreamParser.startState)**⁠?: fn([indentUnit](#language.StreamParser.startState^indentUnit): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [State](#language.StreamParser^State)`

Produce a start state for the parser.

`**[token](#language.StreamParser.token)**([stream](#language.StreamParser.token^stream): [StringStream](#language.StringStream), [state](#language.StreamParser.token^state): [State](#language.StreamParser^State)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Read one token, advancing the stream past it, and returning a string indicating the token's style tag—either the name of one of the tags in [`tags`](https://lezer.codemirror.net/docs/ref#highlight.tags) or [`tokenTable`](#language.StreamParser.tokenTable), or such a name suffixed by one or more tag [modifier](https://lezer.codemirror.net/docs/ref#highlight.Tag%5EdefineModifier) names, separated by periods. For example `"keyword"` or "`variableName.constant"`, or a space-separated set of such token types.

It is okay to return a zero-length token, but only if that updates the state so that the next call will return a non-empty token again.

`**[blankLine](#language.StreamParser.blankLine)**⁠?: fn([state](#language.StreamParser.blankLine^state): [State](#language.StreamParser^State), [indentUnit](#language.StreamParser.blankLine^indentUnit): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

This notifies the parser of a blank line in the input. It can update its state here if it needs to.

`**[copyState](#language.StreamParser.copyState)**⁠?: fn([state](#language.StreamParser.copyState^state): [State](#language.StreamParser^State)) → [State](#language.StreamParser^State)`

Copy a given state. By default, a shallow object copy is done which also copies arrays held at the top level of the object.

`**[indent](#language.StreamParser.indent)**⁠?: fn(  [state](#language.StreamParser.indent^state): [State](#language.StreamParser^State),  [textAfter](#language.StreamParser.indent^textAfter): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [context](#language.StreamParser.indent^context): [IndentContext](#language.IndentContext)  ) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Compute automatic indentation for the line that starts with the given state and text.

`**[languageData](#language.StreamParser.languageData)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<any>`

Default [language data](#state.EditorState.languageDataAt) to attach to this language.

`**[tokenTable](#language.StreamParser.tokenTable)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<[Tag](https://lezer.codemirror.net/docs/ref/#highlight.Tag) | readonly [Tag](https://lezer.codemirror.net/docs/ref/#highlight.Tag)[]>`

Extra tokens to use in this parser. When the tokenizer returns a token name that exists as a property in this object, the corresponding tags will be assigned to the token.

`**[mergeTokens](#language.StreamParser.mergeTokens)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, adjacent tokens of the same type are merged in the output tree. Set this to false to disable that.

#### `class` [StringStream](#language.StringStream)

Encapsulates a single line of input. Given to stream syntax code, which uses it to tokenize the content.

`new **[StringStream](#language.StringStream.constructor)**(  [string](#language.StringStream.constructor^string): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [tabSize](#language.StringStream.constructor^tabSize): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [indentUnit](#language.StringStream.constructor^indentUnit): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [overrideIndent](#language.StringStream.constructor^overrideIndent)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  )`

Create a stream.

`**[pos](#language.StringStream.pos)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The current position on the line.

`**[start](#language.StringStream.start)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start position of the current token.

`**[string](#language.StringStream.string)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The line.

`**[indentUnit](#language.StringStream.indentUnit)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The current indent unit size.

`**[eol](#language.StringStream.eol)**() → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

True if we are at the end of the line.

`**[sol](#language.StringStream.sol)**() → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

True if we are at the start of the line.

`**[peek](#language.StringStream.peek)**() → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Get the next code unit after the current position, or undefined if we're at the end of the line.

`**[next](#language.StringStream.next)**() → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Read the next code unit and advance `this.pos`.

`**[eat](#language.StringStream.eat)**([match](#language.StringStream.eat^match): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp) | fn([ch](#language.StringStream.eat^match^ch): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Match the next character against the given string, regular expression, or predicate. Consume and return it if it matches.

`**[eatWhile](#language.StringStream.eatWhile)**([match](#language.StringStream.eatWhile^match): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp) | fn([ch](#language.StringStream.eatWhile^match^ch): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Continue matching characters that match the given string, regular expression, or predicate function. Return true if any characters were consumed.

`**[eatSpace](#language.StringStream.eatSpace)**() → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Consume whitespace ahead of `this.pos`. Return true if any was found.

`**[skipToEnd](#language.StringStream.skipToEnd)**()`

Move to the end of the line.

`**[skipTo](#language.StringStream.skipTo)**([ch](#language.StringStream.skipTo^ch): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)`

Move to directly before the given character, if found on the current line.

`**[backUp](#language.StringStream.backUp)**([n](#language.StringStream.backUp^n): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

Move back `n` characters.

`**[column](#language.StringStream.column)**() → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Get the column position at `this.pos`.

`**[indentation](#language.StringStream.indentation)**() → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Get the indentation column of the current line.

`**[match](#language.StringStream.match)**(  [pattern](#language.StringStream.match^pattern): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp),  [consume](#language.StringStream.match^consume)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  [caseInsensitive](#language.StringStream.match^caseInsensitive)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [RegExpMatchArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Match the input against the given string or regular expression (which should start with a `^`). Return true or the regexp match if it matches.

Unless `consume` is set to `false`, this will move `this.pos` past the matched text.

When matching a string `caseInsensitive` can be set to true to make the match case-insensitive.

`**[current](#language.StringStream.current)**() → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Get the current token.

## [@codemirror/commands](#commands)

This package exports a collection of generic editing commands, along with key bindings for a lot of them.

### Keymaps

`**[standardKeymap](#commands.standardKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

An array of key bindings closely sticking to platform-standard or widely used bindings. (This includes the bindings from [`emacsStyleKeymap`](#commands.emacsStyleKeymap), with their `key` property changed to `mac`.)

*   ArrowLeft: [`cursorCharLeft`](#commands.cursorCharLeft) ([`selectCharLeft`](#commands.selectCharLeft) with Shift)
*   ArrowRight: [`cursorCharRight`](#commands.cursorCharRight) ([`selectCharRight`](#commands.selectCharRight) with Shift)
*   Ctrl-ArrowLeft (Alt-ArrowLeft on macOS): [`cursorGroupLeft`](#commands.cursorGroupLeft) ([`selectGroupLeft`](#commands.selectGroupLeft) with Shift)
*   Ctrl-ArrowRight (Alt-ArrowRight on macOS): [`cursorGroupRight`](#commands.cursorGroupRight) ([`selectGroupRight`](#commands.selectGroupRight) with Shift)
*   Cmd-ArrowLeft (on macOS): [`cursorLineStart`](#commands.cursorLineStart) ([`selectLineStart`](#commands.selectLineStart) with Shift)
*   Cmd-ArrowRight (on macOS): [`cursorLineEnd`](#commands.cursorLineEnd) ([`selectLineEnd`](#commands.selectLineEnd) with Shift)
*   ArrowUp: [`cursorLineUp`](#commands.cursorLineUp) ([`selectLineUp`](#commands.selectLineUp) with Shift)
*   ArrowDown: [`cursorLineDown`](#commands.cursorLineDown) ([`selectLineDown`](#commands.selectLineDown) with Shift)
*   Cmd-ArrowUp (on macOS): [`cursorDocStart`](#commands.cursorDocStart) ([`selectDocStart`](#commands.selectDocStart) with Shift)
*   Cmd-ArrowDown (on macOS): [`cursorDocEnd`](#commands.cursorDocEnd) ([`selectDocEnd`](#commands.selectDocEnd) with Shift)
*   Ctrl-ArrowUp (on macOS): [`cursorPageUp`](#commands.cursorPageUp) ([`selectPageUp`](#commands.selectPageUp) with Shift)
*   Ctrl-ArrowDown (on macOS): [`cursorPageDown`](#commands.cursorPageDown) ([`selectPageDown`](#commands.selectPageDown) with Shift)
*   PageUp: [`cursorPageUp`](#commands.cursorPageUp) ([`selectPageUp`](#commands.selectPageUp) with Shift)
*   PageDown: [`cursorPageDown`](#commands.cursorPageDown) ([`selectPageDown`](#commands.selectPageDown) with Shift)
*   Home: [`cursorLineBoundaryBackward`](#commands.cursorLineBoundaryBackward) ([`selectLineBoundaryBackward`](#commands.selectLineBoundaryBackward) with Shift)
*   End: [`cursorLineBoundaryForward`](#commands.cursorLineBoundaryForward) ([`selectLineBoundaryForward`](#commands.selectLineBoundaryForward) with Shift)
*   Ctrl-Home (Cmd-Home on macOS): [`cursorDocStart`](#commands.cursorDocStart) ([`selectDocStart`](#commands.selectDocStart) with Shift)
*   Ctrl-End (Cmd-Home on macOS): [`cursorDocEnd`](#commands.cursorDocEnd) ([`selectDocEnd`](#commands.selectDocEnd) with Shift)
*   Enter and Shift-Enter: [`insertNewlineAndIndent`](#commands.insertNewlineAndIndent)
*   Ctrl-a (Cmd-a on macOS): [`selectAll`](#commands.selectAll)
*   Backspace: [`deleteCharBackward`](#commands.deleteCharBackward)
*   Delete: [`deleteCharForward`](#commands.deleteCharForward)
*   Ctrl-Backspace (Alt-Backspace on macOS): [`deleteGroupBackward`](#commands.deleteGroupBackward)
*   Ctrl-Delete (Alt-Delete on macOS): [`deleteGroupForward`](#commands.deleteGroupForward)
*   Cmd-Backspace (macOS): [`deleteLineBoundaryBackward`](#commands.deleteLineBoundaryBackward).
*   Cmd-Delete (macOS): [`deleteLineBoundaryForward`](#commands.deleteLineBoundaryForward).

`**[defaultKeymap](#commands.defaultKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

The default keymap. Includes all bindings from [`standardKeymap`](#commands.standardKeymap) plus the following:

*   Alt-ArrowLeft (Ctrl-ArrowLeft on macOS): [`cursorSyntaxLeft`](#commands.cursorSyntaxLeft) ([`selectSyntaxLeft`](#commands.selectSyntaxLeft) with Shift)
*   Alt-ArrowRight (Ctrl-ArrowRight on macOS): [`cursorSyntaxRight`](#commands.cursorSyntaxRight) ([`selectSyntaxRight`](#commands.selectSyntaxRight) with Shift)
*   Alt-ArrowUp: [`moveLineUp`](#commands.moveLineUp)
*   Alt-ArrowDown: [`moveLineDown`](#commands.moveLineDown)
*   Shift-Alt-ArrowUp: [`copyLineUp`](#commands.copyLineUp)
*   Shift-Alt-ArrowDown: [`copyLineDown`](#commands.copyLineDown)
*   Ctrl-Alt-ArrowUp (Cmd-Alt-ArrowUp on macOS): [`addCursorAbove`](#commands.addCursorAbove).
*   Ctrl-Alt-ArrowDown (Cmd-Alt-ArrowDown on macOS): [`addCursorBelow`](#commands.addCursorBelow).
*   Escape: [`simplifySelection`](#commands.simplifySelection)
*   Ctrl-Enter (Cmd-Enter on macOS): [`insertBlankLine`](#commands.insertBlankLine)
*   Alt-l (Ctrl-l on macOS): [`selectLine`](#commands.selectLine)
*   Ctrl-i (Cmd-i on macOS): [`selectParentSyntax`](#commands.selectParentSyntax)
*   Ctrl-\[ (Cmd-\[ on macOS): [`indentLess`](#commands.indentLess)
*   Ctrl-\] (Cmd-\] on macOS): [`indentMore`](#commands.indentMore)
*   Ctrl-Alt-\\ (Cmd-Alt-\\ on macOS): [`indentSelection`](#commands.indentSelection)
*   Shift-Ctrl-k (Shift-Cmd-k on macOS): [`deleteLine`](#commands.deleteLine)
*   Shift-Ctrl-\\ (Shift-Cmd-\\ on macOS): [`cursorMatchingBracket`](#commands.cursorMatchingBracket)
*   Ctrl-/ (Cmd-/ on macOS): [`toggleComment`](#commands.toggleComment).
*   Shift-Alt-a (Shift-Ctrl-a on macOS): [`toggleBlockComment`](#commands.toggleBlockComment).
*   Ctrl-m (Alt-Shift-m on macOS): [`toggleTabFocusMode`](#commands.toggleTabFocusMode).

`**[emacsStyleKeymap](#commands.emacsStyleKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Array of key bindings containing the Emacs-style bindings that are available on macOS by default.

*   Ctrl-b: [`cursorCharLeft`](#commands.cursorCharLeft) ([`selectCharLeft`](#commands.selectCharLeft) with Shift)
*   Ctrl-f: [`cursorCharRight`](#commands.cursorCharRight) ([`selectCharRight`](#commands.selectCharRight) with Shift)
*   Ctrl-p: [`cursorLineUp`](#commands.cursorLineUp) ([`selectLineUp`](#commands.selectLineUp) with Shift)
*   Ctrl-n: [`cursorLineDown`](#commands.cursorLineDown) ([`selectLineDown`](#commands.selectLineDown) with Shift)
*   Ctrl-a: [`cursorLineStart`](#commands.cursorLineStart) ([`selectLineStart`](#commands.selectLineStart) with Shift)
*   Ctrl-e: [`cursorLineEnd`](#commands.cursorLineEnd) ([`selectLineEnd`](#commands.selectLineEnd) with Shift)
*   Ctrl-d: [`deleteCharForward`](#commands.deleteCharForward)
*   Ctrl-h: [`deleteCharBackward`](#commands.deleteCharBackward)
*   Ctrl-k: [`deleteToLineEnd`](#commands.deleteToLineEnd)
*   Ctrl-Alt-h: [`deleteGroupBackward`](#commands.deleteGroupBackward)
*   Ctrl-o: [`splitLine`](#commands.splitLine)
*   Ctrl-t: [`transposeChars`](#commands.transposeChars)
*   Ctrl-v: [`cursorPageDown`](#commands.cursorPageDown)
*   Alt-v: [`cursorPageUp`](#commands.cursorPageUp)

`**[indentWithTab](#commands.indentWithTab)**: [KeyBinding](#view.KeyBinding)`

A binding that binds Tab to [`indentMore`](#commands.indentMore) and Shift-Tab to [`indentLess`](#commands.indentLess). Please see the [Tab example](../../examples/tab/) before using this.

### Selection

`**[simplifySelection](#commands.simplifySelection)**: [StateCommand](#state.StateCommand)`

Simplify the current selection. When multiple ranges are selected, reduce it to its main range. Otherwise, if the selection is non-empty, convert it to a cursor selection.

#### By character

`**[cursorCharLeft](#commands.cursorCharLeft)**: [Command](#view.Command)`

Move the selection one character to the left (which is backward in left-to-right text, forward in right-to-left text).

`**[selectCharLeft](#commands.selectCharLeft)**: [Command](#view.Command)`

Move the selection head one character to the left, while leaving the anchor in place.

`**[cursorCharRight](#commands.cursorCharRight)**: [Command](#view.Command)`

Move the selection one character to the right.

`**[selectCharRight](#commands.selectCharRight)**: [Command](#view.Command)`

Move the selection head one character to the right.

`**[cursorCharForward](#commands.cursorCharForward)**: [Command](#view.Command)`

Move the selection one character forward.

`**[selectCharForward](#commands.selectCharForward)**: [Command](#view.Command)`

Move the selection head one character forward.

`**[cursorCharBackward](#commands.cursorCharBackward)**: [Command](#view.Command)`

Move the selection one character backward.

`**[selectCharBackward](#commands.selectCharBackward)**: [Command](#view.Command)`

Move the selection head one character backward.

`**[cursorCharForwardLogical](#commands.cursorCharForwardLogical)**: [StateCommand](#state.StateCommand)`

Move the selection one character forward, in logical (non-text-direction-aware) string index order.

`**[selectCharForwardLogical](#commands.selectCharForwardLogical)**: [StateCommand](#state.StateCommand)`

Move the selection head one character forward by logical (non-direction aware) string index order.

`**[cursorCharBackwardLogical](#commands.cursorCharBackwardLogical)**: [StateCommand](#state.StateCommand)`

Move the selection one character backward, in logical string index order.

`**[selectCharBackwardLogical](#commands.selectCharBackwardLogical)**: [StateCommand](#state.StateCommand)`

Move the selection head one character backward by logical string index order.

#### By group

`**[cursorGroupLeft](#commands.cursorGroupLeft)**: [Command](#view.Command)`

Move the selection to the left across one group of word or non-word (but also non-space) characters.

`**[selectGroupLeft](#commands.selectGroupLeft)**: [Command](#view.Command)`

Move the selection head one [group](#commands.cursorGroupLeft) to the left.

`**[cursorGroupRight](#commands.cursorGroupRight)**: [Command](#view.Command)`

Move the selection one group to the right.

`**[selectGroupRight](#commands.selectGroupRight)**: [Command](#view.Command)`

Move the selection head one group to the right.

`**[cursorGroupForward](#commands.cursorGroupForward)**: [Command](#view.Command)`

Move the selection one group forward.

`**[selectGroupForward](#commands.selectGroupForward)**: [Command](#view.Command)`

Move the selection head one group forward.

`**[cursorGroupBackward](#commands.cursorGroupBackward)**: [Command](#view.Command)`

Move the selection one group backward.

`**[selectGroupBackward](#commands.selectGroupBackward)**: [Command](#view.Command)`

Move the selection head one group backward.

`**[cursorGroupForwardWin](#commands.cursorGroupForwardWin)**: [Command](#view.Command)`

Move the cursor one group forward in the default Windows style, where it moves to the start of the next group.

`**[selectGroupForwardWin](#commands.selectGroupForwardWin)**: [Command](#view.Command)`

Move the selection head one group forward in the default Windows style, skipping to the start of the next group.

`**[cursorSubwordForward](#commands.cursorSubwordForward)**: [Command](#view.Command)`

Move the selection one group or camel-case subword forward.

`**[selectSubwordForward](#commands.selectSubwordForward)**: [Command](#view.Command)`

Move the selection head one group or camel-case subword forward.

`**[cursorSubwordBackward](#commands.cursorSubwordBackward)**: [Command](#view.Command)`

Move the selection one group or camel-case subword backward.

`**[selectSubwordBackward](#commands.selectSubwordBackward)**: [Command](#view.Command)`

Move the selection head one group or subword backward.

#### Vertical motion

`**[cursorLineUp](#commands.cursorLineUp)**: [Command](#view.Command)`

Move the selection one line up.

`**[selectLineUp](#commands.selectLineUp)**: [Command](#view.Command)`

Move the selection head one line up.

`**[cursorLineDown](#commands.cursorLineDown)**: [Command](#view.Command)`

Move the selection one line down.

`**[selectLineDown](#commands.selectLineDown)**: [Command](#view.Command)`

Move the selection head one line down.

`**[cursorPageUp](#commands.cursorPageUp)**: [Command](#view.Command)`

Move the selection one page up.

`**[selectPageUp](#commands.selectPageUp)**: [Command](#view.Command)`

Move the selection head one page up.

`**[cursorPageDown](#commands.cursorPageDown)**: [Command](#view.Command)`

Move the selection one page down.

`**[selectPageDown](#commands.selectPageDown)**: [Command](#view.Command)`

Move the selection head one page down.

`**[addCursorAbove](#commands.addCursorAbove)**: [Command](#view.Command)`

Expand the selection by adding a cursor above the heads of currently selected ranges.

`**[addCursorBelow](#commands.addCursorBelow)**: [Command](#view.Command)`

Expand the selection by adding a cursor below the heads of currently selected ranges.

#### By line boundary

`**[cursorLineBoundaryForward](#commands.cursorLineBoundaryForward)**: [Command](#view.Command)`

Move the selection to the next line wrap point, or to the end of the line if there isn't one left on this line.

`**[selectLineBoundaryForward](#commands.selectLineBoundaryForward)**: [Command](#view.Command)`

Move the selection head to the next line boundary.

`**[cursorLineBoundaryBackward](#commands.cursorLineBoundaryBackward)**: [Command](#view.Command)`

Move the selection to previous line wrap point, or failing that to the start of the line. If the line is indented, and the cursor isn't already at the end of the indentation, this will move to the end of the indentation instead of the start of the line.

`**[selectLineBoundaryBackward](#commands.selectLineBoundaryBackward)**: [Command](#view.Command)`

Move the selection head to the previous line boundary.

`**[cursorLineBoundaryLeft](#commands.cursorLineBoundaryLeft)**: [Command](#view.Command)`

Move the selection one line wrap point to the left.

`**[selectLineBoundaryLeft](#commands.selectLineBoundaryLeft)**: [Command](#view.Command)`

Move the selection head one line boundary to the left.

`**[cursorLineBoundaryRight](#commands.cursorLineBoundaryRight)**: [Command](#view.Command)`

Move the selection one line wrap point to the right.

`**[selectLineBoundaryRight](#commands.selectLineBoundaryRight)**: [Command](#view.Command)`

Move the selection head one line boundary to the right.

`**[cursorLineStart](#commands.cursorLineStart)**: [Command](#view.Command)`

Move the selection to the start of the line.

`**[selectLineStart](#commands.selectLineStart)**: [Command](#view.Command)`

Move the selection head to the start of the line.

`**[cursorLineEnd](#commands.cursorLineEnd)**: [Command](#view.Command)`

Move the selection to the end of the line.

`**[selectLineEnd](#commands.selectLineEnd)**: [Command](#view.Command)`

Move the selection head to the end of the line.

`**[selectLine](#commands.selectLine)**: [StateCommand](#state.StateCommand)`

Expand the selection to cover entire lines.

#### By document boundary

`**[cursorDocStart](#commands.cursorDocStart)**: [StateCommand](#state.StateCommand)`

Move the selection to the start of the document.

`**[selectDocStart](#commands.selectDocStart)**: [StateCommand](#state.StateCommand)`

Move the selection head to the start of the document.

`**[cursorDocEnd](#commands.cursorDocEnd)**: [StateCommand](#state.StateCommand)`

Move the selection to the end of the document.

`**[selectDocEnd](#commands.selectDocEnd)**: [StateCommand](#state.StateCommand)`

Move the selection head to the end of the document.

`**[selectAll](#commands.selectAll)**: [StateCommand](#state.StateCommand)`

Select the entire document.

#### By syntax

`**[cursorSyntaxLeft](#commands.cursorSyntaxLeft)**: [Command](#view.Command)`

Move the cursor over the next syntactic element to the left.

`**[selectSyntaxLeft](#commands.selectSyntaxLeft)**: [Command](#view.Command)`

Move the selection head over the next syntactic element to the left.

`**[cursorSyntaxRight](#commands.cursorSyntaxRight)**: [Command](#view.Command)`

Move the cursor over the next syntactic element to the right.

`**[selectSyntaxRight](#commands.selectSyntaxRight)**: [Command](#view.Command)`

Move the selection head over the next syntactic element to the right.

`**[selectParentSyntax](#commands.selectParentSyntax)**: [StateCommand](#state.StateCommand)`

Select the next syntactic construct that is larger than the selection. Note that this will only work insofar as the language [provider](#language.language) you use builds up a full syntax tree.

`**[cursorMatchingBracket](#commands.cursorMatchingBracket)**: [StateCommand](#state.StateCommand)`

Move the selection to the bracket matching the one it is currently on, if any.

`**[selectMatchingBracket](#commands.selectMatchingBracket)**: [StateCommand](#state.StateCommand)`

Extend the selection to the bracket matching the one the selection head is currently on, if any.

### Deletion

`**[deleteCharBackward](#commands.deleteCharBackward)**: [Command](#view.Command)`

Delete the selection, or, for cursor selections, the character or indentation unit before the cursor.

`**[deleteCharBackwardStrict](#commands.deleteCharBackwardStrict)**: [Command](#view.Command)`

Delete the selection or the character before the cursor. Does not implement any extended behavior like deleting whole indentation units in one go.

`**[deleteCharForward](#commands.deleteCharForward)**: [Command](#view.Command)`

Delete the selection or the character after the cursor.

`**[deleteGroupBackward](#commands.deleteGroupBackward)**: [StateCommand](#state.StateCommand)`

Delete the selection or backward until the end of the next [group](#view.EditorView.moveByGroup), only skipping groups of whitespace when they consist of a single space.

`**[deleteGroupForward](#commands.deleteGroupForward)**: [StateCommand](#state.StateCommand)`

Delete the selection or forward until the end of the next group.

`**[deleteGroupForwardWin](#commands.deleteGroupForwardWin)**: [Command](#view.Command)`

Variant of [`deleteGroupForward`](#commands.deleteGroupForward) that uses the Windows convention of also deleting the whitespace after a word.

`**[deleteToLineStart](#commands.deleteToLineStart)**: [Command](#view.Command)`

Delete the selection, or, if it is a cursor selection, delete to the start of the line. If the cursor is directly at the start of the line, delete the line break before it.

`**[deleteToLineEnd](#commands.deleteToLineEnd)**: [Command](#view.Command)`

Delete the selection, or, if it is a cursor selection, delete to the end of the line. If the cursor is directly at the end of the line, delete the line break after it.

`**[deleteLineBoundaryBackward](#commands.deleteLineBoundaryBackward)**: [Command](#view.Command)`

Delete the selection, or, if it is a cursor selection, delete to the start of the line or the next line wrap before the cursor.

`**[deleteLineBoundaryForward](#commands.deleteLineBoundaryForward)**: [Command](#view.Command)`

Delete the selection, or, if it is a cursor selection, delete to the end of the line or the next line wrap after the cursor.

`**[deleteTrailingWhitespace](#commands.deleteTrailingWhitespace)**: [StateCommand](#state.StateCommand)`

Delete all whitespace directly before a line end from the document.

### Line manipulation

`**[splitLine](#commands.splitLine)**: [StateCommand](#state.StateCommand)`

Replace each selection range with a line break, leaving the cursor on the line before the break.

`**[moveLineUp](#commands.moveLineUp)**: [StateCommand](#state.StateCommand)`

Move the selected lines up one line.

`**[moveLineDown](#commands.moveLineDown)**: [StateCommand](#state.StateCommand)`

Move the selected lines down one line.

`**[copyLineUp](#commands.copyLineUp)**: [StateCommand](#state.StateCommand)`

Create a copy of the selected lines. Keep the selection in the top copy.

`**[copyLineDown](#commands.copyLineDown)**: [StateCommand](#state.StateCommand)`

Create a copy of the selected lines. Keep the selection in the bottom copy.

`**[deleteLine](#commands.deleteLine)**: [Command](#view.Command)`

Delete selected lines.

### Indentation

`**[indentSelection](#commands.indentSelection)**: [StateCommand](#state.StateCommand)`

Auto-indent the selected lines. This uses the [indentation service facet](#language.indentService) as source for auto-indent information.

`**[indentMore](#commands.indentMore)**: [StateCommand](#state.StateCommand)`

Add a [unit](#language.indentUnit) of indentation to all selected lines.

`**[indentLess](#commands.indentLess)**: [StateCommand](#state.StateCommand)`

Remove a [unit](#language.indentUnit) of indentation from all selected lines.

`**[insertTab](#commands.insertTab)**: [StateCommand](#state.StateCommand)`

Insert a tab character at the cursor or, if something is selected, use [`indentMore`](#commands.indentMore) to indent the entire selection.

### Character Manipulation

`**[transposeChars](#commands.transposeChars)**: [StateCommand](#state.StateCommand)`

Flip the characters before and after the cursor(s).

`**[insertNewline](#commands.insertNewline)**: [StateCommand](#state.StateCommand)`

Replace the selection with a newline.

`**[insertNewlineAndIndent](#commands.insertNewlineAndIndent)**: [StateCommand](#state.StateCommand)`

Replace the selection with a newline and indent the newly created line(s). If the current line consists only of whitespace, this will also delete that whitespace. When the cursor is between matching brackets, an additional newline will be inserted after the cursor.

`**[insertNewlineKeepIndent](#commands.insertNewlineKeepIndent)**: [StateCommand](#state.StateCommand)`

Replace the selection with a newline and the same amount of indentation as the line above.

`**[insertBlankLine](#commands.insertBlankLine)**: [StateCommand](#state.StateCommand)`

Create a blank, indented line below the current line.

### Undo History

`**[history](#commands.history)**([config](#commands.history^config)⁠?: Object = {}) → [Extension](#state.Extension)`

Create a history extension with the given configuration.

`**[config](#commands.history^config)**`

`**[minDepth](#commands.history^config.minDepth)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The minimum depth (amount of events) to store. Defaults to 100.

`**[newGroupDelay](#commands.history^config.newGroupDelay)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The maximum time (in milliseconds) that adjacent events can be apart and still be grouped together. Defaults to 500.

`**[joinToEvent](#commands.history^config.joinToEvent)**⁠?: fn([tr](#commands.history^config.joinToEvent^tr): [Transaction](#state.Transaction), [isAdjacent](#commands.history^config.joinToEvent^isAdjacent): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, when close enough together in time, changes are joined into an existing undo event if they touch any of the changed ranges from that event. You can pass a custom predicate here to influence that logic.

`**[historyKeymap](#commands.historyKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Default key bindings for the undo history.

*   Mod-z: [`undo`](#commands.undo).
*   Mod-y (Mod-Shift-z on macOS) + Ctrl-Shift-z on Linux: [`redo`](#commands.redo).
*   Mod-u: [`undoSelection`](#commands.undoSelection).
*   Alt-u (Mod-Shift-u on macOS): [`redoSelection`](#commands.redoSelection).

`**[historyField](#commands.historyField)**: [StateField](#state.StateField)<unknown>`

The state field used to store the history data. Should probably only be used when you want to [serialize](#state.EditorState.toJSON) or [deserialize](#state.EditorState%5EfromJSON) state objects in a way that preserves history.

`**[undo](#commands.undo)**: [StateCommand](#state.StateCommand)`

Undo a single group of history events. Returns false if no group was available.

`**[redo](#commands.redo)**: [StateCommand](#state.StateCommand)`

Redo a group of history events. Returns false if no group was available.

`**[undoSelection](#commands.undoSelection)**: [StateCommand](#state.StateCommand)`

Undo a change or selection change.

`**[redoSelection](#commands.redoSelection)**: [StateCommand](#state.StateCommand)`

Redo a change or selection change.

`**[undoDepth](#commands.undoDepth)**([state](#commands.undoDepth^state): [EditorState](#state.EditorState)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The amount of undoable change events available in a given state.

`**[redoDepth](#commands.redoDepth)**([state](#commands.redoDepth^state): [EditorState](#state.EditorState)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The amount of redoable change events available in a given state.

`**[canUndoSelection](#commands.canUndoSelection)**([state](#commands.canUndoSelection^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Test whether there is an undoable selection available.

`**[canRedoSelection](#commands.canRedoSelection)**([state](#commands.canRedoSelection^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Test whether there is a redoable selection available.

`**[isolateHistory](#commands.isolateHistory)**: [AnnotationType](#state.AnnotationType)<"before" | "after" | "full">`

Transaction annotation that will prevent that transaction from being combined with other transactions in the undo history. Given `"before"`, it'll prevent merging with previous transactions. With `"after"`, subsequent transactions won't be combined with this one. With `"full"`, the transaction is isolated on both sides.

`**[invertedEffects](#commands.invertedEffects)**: [Facet](#state.Facet)<fn([tr](#commands.invertedEffects^tr): [Transaction](#state.Transaction)) → readonly [StateEffect](#state.StateEffect)<any>[]>`

This facet provides a way to register functions that, given a transaction, provide a set of effects that the history should store when inverting the transaction. This can be used to integrate some kinds of effects in the history, so that they can be undone (and redone again).

### Commenting and Uncommenting

#### `interface` [CommentTokens](#commands.CommentTokens)

An object of this type can be provided as [language data](#state.EditorState.languageDataAt) under a `"commentTokens"` property to configure comment syntax for a language.

`**[block](#commands.CommentTokens.block)**⁠?: {open: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), close: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)}`

The block comment syntax, if any. For example, for HTML you'd provide `{open: "<!--", close: "-->"}`.

`**[line](#commands.CommentTokens.line)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The line comment syntax. For example `"//"`.

`**[toggleComment](#commands.toggleComment)**: [StateCommand](#state.StateCommand)`

Comment or uncomment the current selection. Will use line comments if available, otherwise falling back to block comments.

`**[toggleLineComment](#commands.toggleLineComment)**: [StateCommand](#state.StateCommand)`

Comment or uncomment the current selection using line comments. The line comment syntax is taken from the [`commentTokens`](#commands.CommentTokens) [language data](#state.EditorState.languageDataAt).

`**[lineComment](#commands.lineComment)**: [StateCommand](#state.StateCommand)`

Comment the current selection using line comments.

`**[lineUncomment](#commands.lineUncomment)**: [StateCommand](#state.StateCommand)`

Uncomment the current selection using line comments.

`**[toggleBlockComment](#commands.toggleBlockComment)**: [StateCommand](#state.StateCommand)`

Comment or uncomment the current selection using block comments. The block comment syntax is taken from the [`commentTokens`](#commands.CommentTokens) [language data](#state.EditorState.languageDataAt).

`**[blockComment](#commands.blockComment)**: [StateCommand](#state.StateCommand)`

Comment the current selection using block comments.

`**[blockUncomment](#commands.blockUncomment)**: [StateCommand](#state.StateCommand)`

Uncomment the current selection using block comments.

`**[toggleBlockCommentByLine](#commands.toggleBlockCommentByLine)**: [StateCommand](#state.StateCommand)`

Comment or uncomment the lines around the current selection using block comments.

### Tab Focus Mode

`**[toggleTabFocusMode](#commands.toggleTabFocusMode)**: [Command](#view.Command)`

Enables or disables [tab-focus mode](#view.EditorView.setTabFocusMode). While on, this prevents the editor's key bindings from capturing Tab or Shift-Tab, making it possible for the user to move focus out of the editor with the keyboard.

`**[temporarilySetTabFocusMode](#commands.temporarilySetTabFocusMode)**: [Command](#view.Command)`

Temporarily enables [tab-focus mode](#view.EditorView.setTabFocusMode) for two seconds or until another key is pressed.

## [@codemirror/search](#search)

`**[searchKeymap](#search.searchKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Default search-related key bindings.

*   Mod-f: [`openSearchPanel`](#search.openSearchPanel)
*   F3, Mod-g: [`findNext`](#search.findNext)
*   Shift-F3, Shift-Mod-g: [`findPrevious`](#search.findPrevious)
*   Mod-Alt-g: [`gotoLine`](#search.gotoLine)
*   Mod-d: [`selectNextOccurrence`](#search.selectNextOccurrence)

`**[search](#search.search)**([config](#search.search^config)⁠?: Object) → [Extension](#state.Extension)`

Add search state to the editor configuration, and optionally configure the search extension. ([`openSearchPanel`](#search.openSearchPanel) will automatically enable this if it isn't already on).

`**[config](#search.search^config)**`

`**[top](#search.search^config.top)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether to position the search panel at the top of the editor (the default is at the bottom).

`**[caseSensitive](#search.search^config.caseSensitive)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether to enable case sensitivity by default when the search panel is activated (defaults to false).

`**[literal](#search.search^config.literal)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether to treat string searches literally by default (defaults to false).

`**[wholeWord](#search.search^config.wholeWord)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Controls whether the default query has by-word matching enabled. Defaults to false.

`**[regexp](#search.search^config.regexp)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Used to turn on regular expression search in the default query. Defaults to false.

`**[createPanel](#search.search^config.createPanel)**⁠?: fn([view](#search.search^config.createPanel^view): [EditorView](#view.EditorView)) → [Panel](#view.Panel)`

Can be used to override the way the search panel is implemented. Should create a [Panel](#view.Panel) that contains a form which lets the user:

*   See the [current](#search.getSearchQuery) search query.
*   Manipulate the [query](#search.SearchQuery) and [update](#search.setSearchQuery) the search state with a new query.
*   Notice external changes to the query by reacting to the appropriate [state effect](#search.setSearchQuery).
*   Run some of the search commands.

The field that should be focused when opening the panel must be tagged with a `main-field=true` DOM attribute.

`**[scrollToMatch](#search.search^config.scrollToMatch)**⁠?: fn([range](#search.search^config.scrollToMatch^range): [SelectionRange](#state.SelectionRange), [view](#search.search^config.scrollToMatch^view): [EditorView](#view.EditorView)) → [StateEffect](#state.StateEffect)<unknown>`

By default, matches are scrolled into view using the default behavior of [`EditorView.scrollIntoView`](#view.EditorView%5EscrollIntoView). This option allows you to pass a custom function to produce the scroll effect.

### Commands

`**[findNext](#search.findNext)**: [Command](#view.Command)`

Open the search panel if it isn't already open, and move the selection to the first match after the current main selection. Will wrap around to the start of the document when it reaches the end.

`**[findPrevious](#search.findPrevious)**: [Command](#view.Command)`

Move the selection to the previous instance of the search query, before the current main selection. Will wrap past the start of the document to start searching at the end again.

`**[selectMatches](#search.selectMatches)**: [Command](#view.Command)`

Select all instances of the search query.

`**[selectSelectionMatches](#search.selectSelectionMatches)**: [StateCommand](#state.StateCommand)`

Select all instances of the currently selected text.

`**[selectNextOccurrence](#search.selectNextOccurrence)**: [StateCommand](#state.StateCommand)`

Select next occurrence of the current selection. Expand selection to the surrounding word when the selection is empty.

`**[replaceNext](#search.replaceNext)**: [Command](#view.Command)`

Replace the current match of the search query.

`**[replaceAll](#search.replaceAll)**: [Command](#view.Command)`

Replace all instances of the search query with the given replacement.

`**[openSearchPanel](#search.openSearchPanel)**: [Command](#view.Command)`

Make sure the search panel is open and focused.

`**[closeSearchPanel](#search.closeSearchPanel)**: [Command](#view.Command)`

Close the search panel.

`**[gotoLine](#search.gotoLine)**: [Command](#view.Command)`

Command that shows a dialog asking the user for a line number, and when a valid position is provided, moves the cursor to that line.

Supports line numbers, relative line offsets prefixed with `+` or `-`, document percentages suffixed with `%`, and an optional column position by adding `:` and a second number after the line number.

### Search Query

#### `class` [SearchQuery](#search.SearchQuery)

A search query. Part of the editor's search state.

`new **[SearchQuery](#search.SearchQuery.constructor)**([config](#search.SearchQuery.constructor^config): [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object))`

Create a query object.

`**[config](#search.SearchQuery.constructor^config)**`

`**[search](#search.SearchQuery.constructor^config.search)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The search string.

`**[caseSensitive](#search.SearchQuery.constructor^config.caseSensitive)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Controls whether the search should be case-sensitive.

`**[literal](#search.SearchQuery.constructor^config.literal)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, string search will replace `\n`, `\r`, and `\t` in the query with newline, return, and tab characters. When this is set to true, that behavior is disabled.

`**[regexp](#search.SearchQuery.constructor^config.regexp)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When true, interpret the search string as a regular expression.

`**[replace](#search.SearchQuery.constructor^config.replace)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The replace text.

`**[wholeWord](#search.SearchQuery.constructor^config.wholeWord)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Enable whole-word matching.

`**[test](#search.SearchQuery.constructor^config.test)**⁠?: fn(  [match](#search.SearchQuery.constructor^config.test^match): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [state](#search.SearchQuery.constructor^config.test^state): [EditorState](#state.EditorState),  [from](#search.SearchQuery.constructor^config.test^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#search.SearchQuery.constructor^config.test^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Optional custom filter. It is passed the matched string, the editor state, and the match range. Matches for which it returns false will be ignored.

`**[search](#search.SearchQuery.search)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The search string (or regular expression).

`**[caseSensitive](#search.SearchQuery.caseSensitive)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether the search is case-sensitive.

`**[literal](#search.SearchQuery.literal)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, string search will replace `\n`, `\r`, and `\t` in the query with newline, return, and tab characters. When this is set to true, that behavior is disabled.

`**[regexp](#search.SearchQuery.regexp)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When true, the search string is interpreted as a regular expression.

`**[replace](#search.SearchQuery.replace)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The replace text, or the empty string if no replace text has been given.

`**[valid](#search.SearchQuery.valid)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether this query is non-empty and, in case of a regular expression search, syntactically valid.

`**[wholeWord](#search.SearchQuery.wholeWord)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When true, matches that contain words are ignored when there are further word characters around them.

`**[test](#search.SearchQuery.test)**: fn(  [match](#search.SearchQuery.test^match): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [state](#search.SearchQuery.test^state): [EditorState](#state.EditorState),  [from](#search.SearchQuery.test^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#search.SearchQuery.test^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) |  [undefined](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/undefined)  `

Optional test function used to filter matches.

`**[eq](#search.SearchQuery.eq)**([other](#search.SearchQuery.eq^other): [SearchQuery](#search.SearchQuery)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Compare this query to another query.

`**[getCursor](#search.SearchQuery.getCursor)**(  [state](#search.SearchQuery.getCursor^state): [EditorState](#state.EditorState) | [Text](#state.Text),  [from](#search.SearchQuery.getCursor^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0,  [to](#search.SearchQuery.getCursor^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)<{from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}>`

Get a search cursor for this query, searching through the given range in the given state.

`**[getSearchQuery](#search.getSearchQuery)**([state](#search.getSearchQuery^state): [EditorState](#state.EditorState)) → [SearchQuery](#search.SearchQuery)`

Get the current search query from an editor state.

`**[setSearchQuery](#search.setSearchQuery)**: [StateEffectType](#state.StateEffectType)<[SearchQuery](#search.SearchQuery)>`

A state effect that updates the current search query. Note that this only has an effect if the search state has been initialized (by including [`search`](#search.search) in your configuration or by running [`openSearchPanel`](#search.openSearchPanel) at least once).

`**[searchPanelOpen](#search.searchPanelOpen)**([state](#search.searchPanelOpen^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Query whether the search panel is open in the given editor state.

### Cursor

#### `class` [SearchCursor](#search.SearchCursor) `implements [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)<{from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), precise: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)}>`

A search cursor provides an iterator over text matches in a document.

`new **[SearchCursor](#search.SearchCursor.constructor)**(  [text](#search.SearchCursor.constructor^text): [Text](#state.Text),  [query](#search.SearchCursor.constructor^query): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [from](#search.SearchCursor.constructor^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0,  [to](#search.SearchCursor.constructor^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = text.length,  [normalize](#search.SearchCursor.constructor^normalize)⁠?: fn([string](#search.SearchCursor.constructor^normalize^string): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [test](#search.SearchCursor.constructor^test)⁠?: fn(  [from](#search.SearchCursor.constructor^test^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#search.SearchCursor.constructor^test^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [buffer](#search.SearchCursor.constructor^test^buffer): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [bufferPos](#search.SearchCursor.constructor^test^bufferPos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  )`

Create a text cursor. The query is the search string, `from` to `to` provides the region to search.

When `normalize` is given, it will be called, on both the query string and the content it is matched against, before comparing. You can, for example, create a case-insensitive search by passing `s => s.toLowerCase()`.

Text is always normalized with [`.normalize("NFKD")`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize) (when supported).

`**[value](#search.SearchCursor.value)**: {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), precise: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)}`

The current match (only holds a meaningful value after [`next`](#search.SearchCursor.next) has been called and when `done` is false).

The `precise` flag will be set to false if the match starts or ends _inside_ a character that, when normalized, expands to multiple characters. It indicates that the `from`\-`to` range covers content that isn't part of the actual match.

`**[done](#search.SearchCursor.done)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether the end of the iterated region has been reached.

`**[next](#search.SearchCursor.next)**() → [SearchCursor](#search.SearchCursor)`

Look for the next match. Updates the iterator's [`value`](#search.SearchCursor.value) and [`done`](#search.SearchCursor.done) properties. Should be called at least once before using the cursor.

`**[nextOverlapping](#search.SearchCursor.nextOverlapping)**() → [SearchCursor](#search.SearchCursor)`

The `next` method will ignore matches that partially overlap a previous match. This method behaves like `next`, but includes such matches.

`**[[symbol iterator]](<#search.SearchCursor.[symbol iterator]>)**() → [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)<{from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}>`

#### `class` [RegExpCursor](#search.RegExpCursor) `implements [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)<  {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), precise: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), match: [RegExpExecArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value)}  >`

This class is similar to [`SearchCursor`](#search.SearchCursor) but searches for a regular expression pattern instead of a plain string.

`new **[RegExpCursor](#search.RegExpCursor.constructor)**(  [text](#search.RegExpCursor.constructor^text): [Text](#state.Text),  [query](#search.RegExpCursor.constructor^query): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [options](#search.RegExpCursor.constructor^options)⁠?: {  ignoreCase⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  test⁠?: fn([from](#search.RegExpCursor.constructor^options.test^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#search.RegExpCursor.constructor^options.test^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [match](#search.RegExpCursor.constructor^options.test^match): [RegExpExecArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  },  [from](#search.RegExpCursor.constructor^from)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = 0,  [to](#search.RegExpCursor.constructor^to)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) = text.length  )`

Create a cursor that will search the given range in the given document. `query` should be the raw pattern (as you'd pass it to `new RegExp`).

`**[done](#search.RegExpCursor.done)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Set to `true` when the cursor has reached the end of the search range.

`**[value](#search.RegExpCursor.value)**: {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), match: [RegExpExecArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value), precise: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)}`

Will contain an object with the extent of the match and the match object when [`next`](#search.RegExpCursor.next) sucessfully finds a match. The `precise` flag is always true for this type of cursor, and only there to make sure this cursor is a subtype of `SearchCursor`.

`**[next](#search.RegExpCursor.next)**() → [RegExpCursor](#search.RegExpCursor)`

Move to the next match, if there is one.

`**[[symbol iterator]](<#search.RegExpCursor.[symbol iterator]>)**() → [Iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)<{from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), match: [RegExpExecArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match#Return_value)}>`

### Selection matching

`**[highlightSelectionMatches](#search.highlightSelectionMatches)**([options](#search.highlightSelectionMatches^options)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)) → [Extension](#state.Extension)`

This extension highlights text that matches the selection. It uses the `"cm-selectionMatch"` class for the highlighting. When `highlightWordAroundCursor` is enabled, the word at the cursor itself will be highlighted with `"cm-selectionMatch-main"`.

`**[options](#search.highlightSelectionMatches^options)**`

`**[highlightWordAroundCursor](#search.highlightSelectionMatches^options.highlightWordAroundCursor)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Determines whether, when nothing is selected, the word around the cursor is matched instead. Defaults to false.

`**[minSelectionLength](#search.highlightSelectionMatches^options.minSelectionLength)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The minimum length of the selection before it is highlighted. Defaults to 1 (always highlight non-cursor selections).

`**[maxMatches](#search.highlightSelectionMatches^options.maxMatches)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The amount of matches (in the viewport) at which to disable highlighting. Defaults to 100.

`**[wholeWords](#search.highlightSelectionMatches^options.wholeWords)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether to only highlight whole words.

## [@codemirror/autocomplete](#autocomplete)

#### `interface` [Completion](#autocomplete.Completion)

Objects type used to represent individual completions.

`**[label](#autocomplete.Completion.label)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The label to show in the completion picker. This is what input is matched against to determine whether a completion matches (and how well it matches).

`**[displayLabel](#autocomplete.Completion.displayLabel)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

An optional override for the completion's visible label. When using this, matched characters will only be highlighted if you provide a [`getMatch`](#autocomplete.CompletionResult.getMatch) function.

`**[sortText](#autocomplete.Completion.sortText)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Overrides the text that is used to sort completions. Will default to `label` if not given.

`**[detail](#autocomplete.Completion.detail)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

An optional short piece of information to show (with a different style) after the label.

`**[info](#autocomplete.Completion.info)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) |  fn([completion](#autocomplete.Completion.info^completion): [Completion](#autocomplete.Completion)) → [Node](https://developer.mozilla.org/en/docs/DOM/Node) |  {dom: [Node](https://developer.mozilla.org/en/docs/DOM/Node), destroy⁠?: fn()} |  [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[CompletionInfo](#autocomplete.CompletionInfo)> |  [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)    `

Additional info to show when the completion is selected. Can be a plain string or a function that'll render the DOM structure to show when invoked.

`**[apply](#autocomplete.Completion.apply)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) |  fn(  [view](#autocomplete.Completion.apply^view): [EditorView](#view.EditorView),  [completion](#autocomplete.Completion.apply^completion): [Completion](#autocomplete.Completion),  [from](#autocomplete.Completion.apply^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#autocomplete.Completion.apply^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  )  `

How to apply the completion. The default is to replace it with its [label](#autocomplete.Completion.label). When this holds a string, the completion range is replaced by that string. When it is a function, that function is called to perform the completion. If it fires a transaction, it is responsible for adding the [`pickedCompletion`](#autocomplete.pickedCompletion) annotation to it.

`**[type](#autocomplete.Completion.type)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The type of the completion. This is used to pick an icon to show for the completion. Icons are styled with a CSS class created by appending the type name to `"cm-completionIcon-"`. You can define or restyle icons by defining these selectors. The base library defines simple icons for `class`, `constant`, `enum`, `function`, `interface`, `keyword`, `method`, `namespace`, `property`, `text`, `type`, and `variable`.

Multiple types can be provided by separating them with spaces.

`**[commitCharacters](#autocomplete.Completion.commitCharacters)**⁠?: readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

When this option is selected, and one of these characters is typed, insert the completion before typing the character.

`**[boost](#autocomplete.Completion.boost)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

When given, should be a number from -99 to 99 that adjusts how this completion is ranked compared to other completions that match the input as well as this one. A negative number moves it down the list, a positive number moves it up.

`**[section](#autocomplete.Completion.section)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [CompletionSection](#autocomplete.CompletionSection)`

Can be used to divide the completion list into sections. Completions in a given section (matched by name) will be grouped together, with a heading above them. Options without section will appear above all sections. A string value is equivalent to a `{name}` object.

`type **[CompletionInfo](#autocomplete.CompletionInfo)** = [Node](https://developer.mozilla.org/en/docs/DOM/Node) | {dom: [Node](https://developer.mozilla.org/en/docs/DOM/Node), destroy⁠?: fn()} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

The type returned from [`Completion.info`](#autocomplete.Completion.info). May be a DOM node, null to indicate there is no info, or an object with an optional `destroy` method that cleans up the node.

#### `interface` [CompletionSection](#autocomplete.CompletionSection)

Object used to describe a completion [section](#autocomplete.Completion.section). It is recommended to create a shared object used by all the completions in a given section.

`**[name](#autocomplete.CompletionSection.name)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The name of the section. If no `render` method is present, this will be displayed above the options.

`**[header](#autocomplete.CompletionSection.header)**⁠?: fn([section](#autocomplete.CompletionSection.header^section): [CompletionSection](#autocomplete.CompletionSection)) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

An optional function that renders the section header. Since the headers are shown inside a list, you should make sure the resulting element has a `display: list-item` style.

`**[rank](#autocomplete.CompletionSection.rank)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | "dynamic"`

By default, sections are ordered alphabetically by name. To specify an explicit order, `rank` can be used. Sections with a lower rank will be shown above sections with a higher rank.

When set to `"dynamic"`, the section's position compared to other dynamic sections depends on the matching score of the best-matching option in the sections.

`**[autocompletion](#autocomplete.autocompletion)**([config](#autocomplete.autocompletion^config)⁠?: Object = {}) → [Extension](#state.Extension)`

Returns an extension that enables autocompletion.

`**[config](#autocomplete.autocompletion^config)**`

`**[activateOnTyping](#autocomplete.autocompletion^config.activateOnTyping)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When enabled (defaults to true), autocompletion will start whenever the user types something that can be completed.

`**[activateOnCompletion](#autocomplete.autocompletion^config.activateOnCompletion)**⁠?: fn([completion](#autocomplete.autocompletion^config.activateOnCompletion^completion): [Completion](#autocomplete.Completion)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When given, if a completion that matches the predicate is picked, reactivate completion again as if it was typed normally.

`**[activateOnTypingDelay](#autocomplete.autocompletion^config.activateOnTypingDelay)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The amount of time to wait for further typing before querying completion sources via [`activateOnTyping`](#autocomplete.autocompletion%5Econfig.activateOnTyping). Defaults to 100, which should be fine unless your completion source is very slow and/or doesn't use `validFor`.

`**[selectOnOpen](#autocomplete.autocompletion^config.selectOnOpen)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, when completion opens, the first option is selected and can be confirmed with [`acceptCompletion`](#autocomplete.acceptCompletion). When this is set to false, the completion widget starts with no completion selected, and the user has to explicitly move to a completion before you can confirm one.

`**[override](#autocomplete.autocompletion^config.override)**⁠?: readonly [CompletionSource](#autocomplete.CompletionSource)[]`

Override the completion sources used. By default, they will be taken from the `"autocomplete"` [language data](#state.EditorState.languageDataAt) (which should hold [completion sources](#autocomplete.CompletionSource) or arrays of [completions](#autocomplete.Completion)).

`**[closeOnBlur](#autocomplete.autocompletion^config.closeOnBlur)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Determines whether the completion tooltip is closed when the editor loses focus. Defaults to true.

`**[maxRenderedOptions](#autocomplete.autocompletion^config.maxRenderedOptions)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The maximum number of options to render to the DOM.

`**[defaultKeymap](#autocomplete.autocompletion^config.defaultKeymap)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Set this to false to disable the [default completion keymap](#autocomplete.completionKeymap). (This requires you to add bindings to control completion yourself. The bindings should probably have a higher precedence than other bindings for the same keys.)

`**[aboveCursor](#autocomplete.autocompletion^config.aboveCursor)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, completions are shown below the cursor when there is space. Setting this to true will make the extension put the completions above the cursor when possible.

`**[tooltipClass](#autocomplete.autocompletion^config.tooltipClass)**⁠?: fn([state](#autocomplete.autocompletion^config.tooltipClass^state): [EditorState](#state.EditorState)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

When given, this may return an additional CSS class to add to the completion dialog element.

`**[optionClass](#autocomplete.autocompletion^config.optionClass)**⁠?: fn([completion](#autocomplete.autocompletion^config.optionClass^completion): [Completion](#autocomplete.Completion)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

This can be used to add additional CSS classes to completion options.

`**[icons](#autocomplete.autocompletion^config.icons)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, the library will render icons based on the completion's [type](#autocomplete.Completion.type) in front of each option. Set this to false to turn that off.

`**[addToOptions](#autocomplete.autocompletion^config.addToOptions)**⁠?: {  render: fn(  [completion](#autocomplete.autocompletion^config.addToOptions.render^completion): [Completion](#autocomplete.Completion),  [state](#autocomplete.autocompletion^config.addToOptions.render^state): [EditorState](#state.EditorState),  [view](#autocomplete.autocompletion^config.addToOptions.render^view): [EditorView](#view.EditorView)  ) → [Node](https://developer.mozilla.org/en/docs/DOM/Node) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null),  position: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  }[]`

This option can be used to inject additional content into options. The `render` function will be called for each visible completion, and should produce a DOM node to show. `position` determines where in the DOM the result appears, relative to other added widgets and the standard content. The default icons have position 20, the label position 50, and the detail position 80.

`**[positionInfo](#autocomplete.autocompletion^config.positionInfo)**⁠?: fn(  [view](#autocomplete.autocompletion^config.positionInfo^view): [EditorView](#view.EditorView),  [list](#autocomplete.autocompletion^config.positionInfo^list): [Rect](#view.Rect),  [option](#autocomplete.autocompletion^config.positionInfo^option): [Rect](#view.Rect),  [info](#autocomplete.autocompletion^config.positionInfo^info): [Rect](#view.Rect),  [space](#autocomplete.autocompletion^config.positionInfo^space): [Rect](#view.Rect)  ) → {style⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), class⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)}`

By default, [info](#autocomplete.Completion.info) tooltips are placed to the side of the selected completion. This option can be used to override that. It will be given rectangles for the list of completions, the selected option, the info element, and the availble [tooltip space](#view.tooltips%5Econfig.tooltipSpace), and should return style and/or class strings for the info element.

`**[compareCompletions](#autocomplete.autocompletion^config.compareCompletions)**⁠?: fn([a](#autocomplete.autocompletion^config.compareCompletions^a): [Completion](#autocomplete.Completion), [b](#autocomplete.autocompletion^config.compareCompletions^b): [Completion](#autocomplete.Completion)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The comparison function to use when sorting completions with the same match score. Defaults to using [`localeCompare`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare).

`**[filterStrict](#autocomplete.autocompletion^config.filterStrict)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When set to true (the default is false), turn off fuzzy matching of completions and only show those that start with the text the user typed. Only takes effect for results where [`filter`](#autocomplete.CompletionResult.filter) isn't false.

`**[interactionDelay](#autocomplete.autocompletion^config.interactionDelay)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

By default, commands relating to an open completion only take effect 75 milliseconds after the completion opened, so that key presses made before the user is aware of the tooltip don't go to the tooltip. This option can be used to configure that delay.

`**[updateSyncTime](#autocomplete.autocompletion^config.updateSyncTime)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

When there are multiple asynchronous completion sources, this controls how long the extension waits for a slow source before displaying results from faster sources. Defaults to 100 milliseconds.

`**[completionStatus](#autocomplete.completionStatus)**([state](#autocomplete.completionStatus^state): [EditorState](#state.EditorState)) → "active" | "pending" | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the current completion status. When completions are available, this will return `"active"`. When completions are pending (in the process of being queried), this returns `"pending"`. Otherwise, it returns `null`.

`**[currentCompletions](#autocomplete.currentCompletions)**([state](#autocomplete.currentCompletions^state): [EditorState](#state.EditorState)) → readonly [Completion](#autocomplete.Completion)[]`

Returns the available completions as an array.

`**[selectedCompletion](#autocomplete.selectedCompletion)**([state](#autocomplete.selectedCompletion^state): [EditorState](#state.EditorState)) → [Completion](#autocomplete.Completion) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Return the currently selected completion, if any.

`**[selectedCompletionIndex](#autocomplete.selectedCompletionIndex)**([state](#autocomplete.selectedCompletionIndex^state): [EditorState](#state.EditorState)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Returns the currently selected position in the active completion list, or null if no completions are active.

`**[setSelectedCompletion](#autocomplete.setSelectedCompletion)**([index](#autocomplete.setSelectedCompletion^index): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [StateEffect](#state.StateEffect)<unknown>`

Create an effect that can be attached to a transaction to change the currently selected completion.

`**[pickedCompletion](#autocomplete.pickedCompletion)**: [AnnotationType](#state.AnnotationType)<[Completion](#autocomplete.Completion)>`

This annotation is added to transactions that are produced by picking a completion.

### Sources

#### `class` [CompletionContext](#autocomplete.CompletionContext)

An instance of this is passed to completion source functions.

`new **[CompletionContext](#autocomplete.CompletionContext.constructor)**(  [state](#autocomplete.CompletionContext.constructor^state): [EditorState](#state.EditorState),  [pos](#autocomplete.CompletionContext.constructor^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [explicit](#autocomplete.CompletionContext.constructor^explicit): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean),  [view](#autocomplete.CompletionContext.constructor^view)⁠?: [EditorView](#view.EditorView)  )`

Create a new completion context. (Mostly useful for testing completion sources—in the editor, the extension will create these for you.)

`**[state](#autocomplete.CompletionContext.state)**: [EditorState](#state.EditorState)`

The editor state that the completion happens in.

`**[pos](#autocomplete.CompletionContext.pos)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The position at which the completion is happening.

`**[explicit](#autocomplete.CompletionContext.explicit)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Indicates whether completion was activated explicitly, or implicitly by typing. The usual way to respond to this is to only return completions when either there is part of a completable entity before the cursor, or `explicit` is true.

`**[view](#autocomplete.CompletionContext.view)**⁠?: [EditorView](#view.EditorView)`

The editor view. May be undefined if the context was created in a situation where there is no such view available, such as in synchronous updates via [`CompletionResult.update`](#autocomplete.CompletionResult.update) or when called by test code.

`**[tokenBefore](#autocomplete.CompletionContext.tokenBefore)**([types](#autocomplete.CompletionContext.tokenBefore^types): readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), text: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), type: [NodeType](https://lezer.codemirror.net/docs/ref/#common.NodeType)} |  [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  `

Get the extent, content, and (if there is a token) type of the token before `this.pos`.

`**[matchBefore](#autocomplete.CompletionContext.matchBefore)**([expr](#autocomplete.CompletionContext.matchBefore^expr): [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)) → {from: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), to: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), text: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the match of the given expression directly before the cursor.

`**[aborted](#autocomplete.CompletionContext.aborted)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Yields true when the query has been aborted. Can be useful in asynchronous queries to avoid doing work that will be ignored.

`**[addEventListener](#autocomplete.CompletionContext.addEventListener)**(  [type](#autocomplete.CompletionContext.addEventListener^type): "abort",  [listener](#autocomplete.CompletionContext.addEventListener^listener): fn(),  [options](#autocomplete.CompletionContext.addEventListener^options)⁠?: {onDocChange: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)}  )`

Allows you to register abort handlers, which will be called when the query is [aborted](#autocomplete.CompletionContext.aborted).

By default, running queries will not be aborted for regular typing or backspacing, on the assumption that they are likely to return a result with a [`validFor`](#autocomplete.CompletionResult.validFor) field that allows the result to be used after all. Passing `onDocChange: true` will cause this query to be aborted for any document change.

#### `interface` [CompletionResult](#autocomplete.CompletionResult)

Interface for objects returned by completion sources.

`**[from](#autocomplete.CompletionResult.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the range that is being completed.

`**[to](#autocomplete.CompletionResult.to)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the range that is being completed. Defaults to the main cursor position.

`**[options](#autocomplete.CompletionResult.options)**: readonly [Completion](#autocomplete.Completion)[]`

The completions returned. These don't have to be compared with the input by the source—the autocompletion system will do its own matching (against the text between `from` and `to`) and sorting.

`**[validFor](#autocomplete.CompletionResult.validFor)**⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp) |  fn(  [text](#autocomplete.CompletionResult.validFor^text): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [from](#autocomplete.CompletionResult.validFor^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#autocomplete.CompletionResult.validFor^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [state](#autocomplete.CompletionResult.validFor^state): [EditorState](#state.EditorState)  ) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)  `

When given, further typing or deletion that causes the part of the document between ([mapped](#state.ChangeDesc.mapPos)) `from` and `to` to match this regular expression or predicate function will not query the completion source again, but continue with this list of options. This can help a lot with responsiveness, since it allows the completion list to be updated synchronously.

`**[filter](#autocomplete.CompletionResult.filter)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, the library filters and scores completions. Set `filter` to `false` to disable this, and cause your completions to all be included, in the order they were given. When there are other sources, unfiltered completions appear at the top of the list of completions. `validFor` must not be given when `filter` is `false`, because it only works when filtering.

`**[getMatch](#autocomplete.CompletionResult.getMatch)**⁠?: fn([completion](#autocomplete.CompletionResult.getMatch^completion): [Completion](#autocomplete.Completion), [matched](#autocomplete.CompletionResult.getMatch^matched)⁠?: readonly [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)[]) → readonly [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)[]`

When [`filter`](#autocomplete.CompletionResult.filter) is set to `false` or a completion has a [`displayLabel`](#autocomplete.Completion.displayLabel), this may be provided to compute the ranges on the label that match the input. Should return an array of numbers where each pair of adjacent numbers provide the start and end of a range. The second argument, the match found by the library, is only passed when `filter` isn't `false`.

`**[update](#autocomplete.CompletionResult.update)**⁠?: fn(  [current](#autocomplete.CompletionResult.update^current): [CompletionResult](#autocomplete.CompletionResult),  [from](#autocomplete.CompletionResult.update^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#autocomplete.CompletionResult.update^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [context](#autocomplete.CompletionResult.update^context): [CompletionContext](#autocomplete.CompletionContext)  ) → [CompletionResult](#autocomplete.CompletionResult) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Synchronously update the completion result after typing or deletion. If given, this should not do any expensive work, since it will be called during editor state updates. The function should make sure (similar to [`validFor`](#autocomplete.CompletionResult.validFor)) that the completion still applies in the new state.

`**[map](#autocomplete.CompletionResult.map)**⁠?: fn([current](#autocomplete.CompletionResult.map^current): [CompletionResult](#autocomplete.CompletionResult), [changes](#autocomplete.CompletionResult.map^changes): [ChangeDesc](#state.ChangeDesc)) → [CompletionResult](#autocomplete.CompletionResult) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

When results contain position-dependent information in, for example, `apply` methods, you can provide this method to update the result for transactions that happen after the query. It is not necessary to update `from` and `to`—those are tracked automatically.

`**[commitCharacters](#autocomplete.CompletionResult.commitCharacters)**⁠?: readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

Set a default set of [commit characters](#autocomplete.Completion.commitCharacters) for all options in this result.

`type **[CompletionSource](#autocomplete.CompletionSource)** = fn([context](#autocomplete.CompletionSource^context): [CompletionContext](#autocomplete.CompletionContext)) → [CompletionResult](#autocomplete.CompletionResult) |  [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[CompletionResult](#autocomplete.CompletionResult) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)> |  [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  `

The function signature for a completion source. Such a function may return its [result](#autocomplete.CompletionResult) synchronously or as a promise. Returning null indicates no completions are available.

`**[completeFromList](#autocomplete.completeFromList)**([list](#autocomplete.completeFromList^list): readonly ([string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [Completion](#autocomplete.Completion))[]) → [CompletionSource](#autocomplete.CompletionSource)`

Given a a fixed array of options, return an autocompleter that completes them.

`**[ifIn](#autocomplete.ifIn)**([nodes](#autocomplete.ifIn^nodes): readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[], [source](#autocomplete.ifIn^source): [CompletionSource](#autocomplete.CompletionSource)) → [CompletionSource](#autocomplete.CompletionSource)`

Wrap the given completion source so that it will only fire when the cursor is in a syntax node with one of the given names.

`**[ifNotIn](#autocomplete.ifNotIn)**([nodes](#autocomplete.ifNotIn^nodes): readonly [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[], [source](#autocomplete.ifNotIn^source): [CompletionSource](#autocomplete.CompletionSource)) → [CompletionSource](#autocomplete.CompletionSource)`

Wrap the given completion source so that it will not fire when the cursor is in a syntax node with one of the given names.

`**[completeAnyWord](#autocomplete.completeAnyWord)**: [CompletionSource](#autocomplete.CompletionSource)`

A completion source that will scan the document for words (using a [character categorizer](#state.EditorState.charCategorizer)), and return those as completions.

`**[insertCompletionText](#autocomplete.insertCompletionText)**(  [state](#autocomplete.insertCompletionText^state): [EditorState](#state.EditorState),  [text](#autocomplete.insertCompletionText^text): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [from](#autocomplete.insertCompletionText^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#autocomplete.insertCompletionText^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  ) → [TransactionSpec](#state.TransactionSpec)`

Helper function that returns a transaction spec which inserts a completion's text in the main selection range, and any other selection range that has the same text in front of it.

### Commands

`**[startCompletion](#autocomplete.startCompletion)**: [Command](#view.Command)`

Explicitly start autocompletion.

`**[closeCompletion](#autocomplete.closeCompletion)**: [Command](#view.Command)`

Close the currently active completion.

`**[acceptCompletion](#autocomplete.acceptCompletion)**: [Command](#view.Command)`

Accept the current completion.

`**[moveCompletionSelection](#autocomplete.moveCompletionSelection)**([forward](#autocomplete.moveCompletionSelection^forward): [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean), [by](#autocomplete.moveCompletionSelection^by)⁠?: "option" | "page" = "option") → [Command](#view.Command)`

Returns a command that moves the completion selection forward or backward by the given amount.

`**[completionKeymap](#autocomplete.completionKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Basic keybindings for autocompletion.

*   Ctrl-Space (and Alt-\` or Alt-i on macOS): [`startCompletion`](#autocomplete.startCompletion)
*   Escape: [`closeCompletion`](#autocomplete.closeCompletion)
*   ArrowDown: [`moveCompletionSelection`](#autocomplete.moveCompletionSelection)`(true)`
*   ArrowUp: [`moveCompletionSelection`](#autocomplete.moveCompletionSelection)`(false)`
*   PageDown: [`moveCompletionSelection`](#autocomplete.moveCompletionSelection)`(true, "page")`
*   PageUp: [`moveCompletionSelection`](#autocomplete.moveCompletionSelection)`(false, "page")`
*   Enter: [`acceptCompletion`](#autocomplete.acceptCompletion)

### Snippets

`**[snippet](#autocomplete.snippet)**([template](#autocomplete.snippet^template): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → fn(  [editor](#autocomplete.snippet^returns^editor): {state: [EditorState](#state.EditorState), dispatch: fn([tr](#autocomplete.snippet^returns^editor.dispatch^tr): [Transaction](#state.Transaction))},  [completion](#autocomplete.snippet^returns^completion): [Completion](#autocomplete.Completion) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null),  [from](#autocomplete.snippet^returns^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [to](#autocomplete.snippet^returns^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)  )`

Convert a snippet template to a function that can [apply](#autocomplete.Completion.apply) it. Snippets are written using syntax like this:

```
"for (let ${index} = 0; ${index} < ${end}; ${index}++) {\n\t${}\n}"
```

Each `${}` placeholder (you may also use `#{}`) indicates a field that the user can fill in. Its name, if any, will be the default content for the field.

When the snippet is activated by calling the returned function, the code is inserted at the given position. Newlines in the template are indented by the indentation of the start line, plus one [indent unit](#language.indentUnit) per tab character after the newline.

On activation, (all instances of) the first field are selected. The user can move between fields with Tab and Shift-Tab as long as the fields are active. Moving to the last field or moving the cursor out of the current field deactivates the fields.

The order of fields defaults to textual order, but you can add numbers to placeholders (`${1}` or `${1:defaultText}`) to provide a custom order. `${0}` is special—it is always the last stop, where the cursor ends up after tabbing through the other fields.

To include a literal `{` or `}` in your template, put a backslash in front of it. This will be removed and the brace will not be interpreted as indicating a placeholder.

`**[snippetCompletion](#autocomplete.snippetCompletion)**([template](#autocomplete.snippetCompletion^template): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [completion](#autocomplete.snippetCompletion^completion): [Completion](#autocomplete.Completion)) → [Completion](#autocomplete.Completion)`

Create a completion from a snippet. Returns an object with the properties from `completion`, plus an `apply` function that applies the snippet.

`**[nextSnippetField](#autocomplete.nextSnippetField)**: [StateCommand](#state.StateCommand)`

Move to the next snippet field, if available.

`**[hasNextSnippetField](#autocomplete.hasNextSnippetField)**([state](#autocomplete.hasNextSnippetField^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Check if there is an active snippet with a next field for `nextSnippetField` to move to.

`**[prevSnippetField](#autocomplete.prevSnippetField)**: [StateCommand](#state.StateCommand)`

Move to the previous snippet field, if available.

`**[hasPrevSnippetField](#autocomplete.hasPrevSnippetField)**([state](#autocomplete.hasPrevSnippetField^state): [EditorState](#state.EditorState)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Returns true if there is an active snippet and a previous field for `prevSnippetField` to move to.

`**[clearSnippet](#autocomplete.clearSnippet)**: [StateCommand](#state.StateCommand)`

A command that clears the active snippet, if any.

`**[snippetKeymap](#autocomplete.snippetKeymap)**: [Facet](#state.Facet)<readonly [KeyBinding](#view.KeyBinding)[], readonly [KeyBinding](#view.KeyBinding)[]>`

A facet that can be used to configure the key bindings used by snippets. The default binds Tab to [`nextSnippetField`](#autocomplete.nextSnippetField), Shift-Tab to [`prevSnippetField`](#autocomplete.prevSnippetField), and Escape to [`clearSnippet`](#autocomplete.clearSnippet).

### Automatic Bracket Closing

#### `interface` [CloseBracketConfig](#autocomplete.CloseBracketConfig)

Configures bracket closing behavior for a syntax (via [language data](#state.EditorState.languageDataAt)) using the `"closeBrackets"` identifier.

`**[brackets](#autocomplete.CloseBracketConfig.brackets)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

The opening brackets to close. Defaults to `["(", "[", "{", "'", '"']`. Brackets may be single characters or a triple of quotes (as in `"'''"`).

`**[before](#autocomplete.CloseBracketConfig.before)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Characters in front of which newly opened brackets are automatically closed. Closing always happens in front of whitespace. Defaults to `")]}:;>"`.

`**[stringPrefixes](#autocomplete.CloseBracketConfig.stringPrefixes)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)[]`

When determining whether a given node may be a string, recognize these prefixes before the opening quote.

`**[closeBrackets](#autocomplete.closeBrackets)**() → [Extension](#state.Extension)`

Extension to enable bracket-closing behavior. When a closeable bracket is typed, its closing bracket is immediately inserted after the cursor. When closing a bracket directly in front of a closing bracket inserted by the extension, the cursor moves over that bracket.

`**[closeBracketsKeymap](#autocomplete.closeBracketsKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Close-brackets related key bindings. Binds Backspace to [`deleteBracketPair`](#autocomplete.deleteBracketPair).

`**[deleteBracketPair](#autocomplete.deleteBracketPair)**: [StateCommand](#state.StateCommand)`

Command that implements deleting a pair of matching brackets when the cursor is between them.

`**[insertBracket](#autocomplete.insertBracket)**([state](#autocomplete.insertBracket^state): [EditorState](#state.EditorState), [bracket](#autocomplete.insertBracket^bracket): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Transaction](#state.Transaction) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Implements the extension's behavior on text insertion. If the given string counts as a bracket in the language around the selection, and replacing the selection with it requires custom behavior (inserting a closing version or skipping past a previously-closed bracket), this function returns a transaction representing that custom behavior. (You only need this if you want to programmatically insert brackets—the [`closeBrackets`](#autocomplete.closeBrackets) extension will take care of running this for user input.)

## [@codemirror/lint](#lint)

`**[lintKeymap](#lint.lintKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

A set of default key bindings for the lint functionality.

*   Ctrl-Shift-m (Cmd-Shift-m on macOS): [`openLintPanel`](#lint.openLintPanel)
*   F8: [`nextDiagnostic`](#lint.nextDiagnostic)

#### `interface` [Diagnostic](#lint.Diagnostic)

Describes a problem or hint for a piece of code.

`**[from](#lint.Diagnostic.from)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start position of the relevant text.

`**[to](#lint.Diagnostic.to)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end position. May be equal to `from`, though actually covering text is preferable.

`**[severity](#lint.Diagnostic.severity)**: "error" | "hint" | "info" | "warning"`

The severity of the problem. This will influence how it is displayed.

`**[markClass](#lint.Diagnostic.markClass)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

When given, add an extra CSS class to parts of the code that this diagnostic applies to.

`**[source](#lint.Diagnostic.source)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

An optional source string indicating where the diagnostic is coming from. You can put the name of your linter here, if applicable.

`**[message](#lint.Diagnostic.message)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The message associated with this diagnostic.

`**[renderMessage](#lint.Diagnostic.renderMessage)**⁠?: fn([view](#lint.Diagnostic.renderMessage^view): [EditorView](#view.EditorView)) → [Node](https://developer.mozilla.org/en/docs/DOM/Node)`

An optional custom rendering function that displays the message as a DOM node.

`**[actions](#lint.Diagnostic.actions)**⁠?: readonly [Action](#lint.Action)[]`

An optional array of actions that can be taken on this diagnostic.

#### `interface` [Action](#lint.Action)

An action associated with a diagnostic.

`**[name](#lint.Action.name)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The label to show to the user. Should be relatively short.

`**[markClass](#lint.Action.markClass)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

When given, add an extra CSS class to the action button.

`**[apply](#lint.Action.apply)**([view](#lint.Action.apply^view): [EditorView](#view.EditorView), [from](#lint.Action.apply^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#lint.Action.apply^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

The function to call when the user activates this action. Is given the diagnostic's _current_ position, which may have changed since the creation of the diagnostic, due to editing.

`**[linter](#lint.linter)**([source](#lint.linter^source): [LintSource](#lint.LintSource) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null), [config](#lint.linter^config)⁠?: Object = {}) → [Extension](#state.Extension)`

Given a diagnostic source, this function returns an extension that enables linting with that source. It will be called whenever the editor is idle (after its content changed).

Note that settings given here will apply to all linters active in the editor. If `null` is given as source, this only configures the lint extension.

`**[config](#lint.linter^config)**`

`**[delay](#lint.linter^config.delay)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Time to wait (in milliseconds) after a change before running the linter. Defaults to 750ms.

`**[needsRefresh](#lint.linter^config.needsRefresh)**⁠?: fn([update](#lint.linter^config.needsRefresh^update): [ViewUpdate](#view.ViewUpdate)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Optional predicate that can be used to indicate when diagnostics need to be recomputed. Linting is always re-done on document changes.

`**[markerFilter](#lint.linter^config.markerFilter)**⁠?: fn(  [diagnostics](#lint.linter^config.markerFilter^diagnostics): readonly [Diagnostic](#lint.Diagnostic)[],  [state](#lint.linter^config.markerFilter^state): [EditorState](#state.EditorState)  ) → [Diagnostic](#lint.Diagnostic)[]`

Optional filter to determine which diagnostics produce markers in the content.

`**[tooltipFilter](#lint.linter^config.tooltipFilter)**⁠?: fn(  [diagnostics](#lint.linter^config.tooltipFilter^diagnostics): readonly [Diagnostic](#lint.Diagnostic)[],  [state](#lint.linter^config.tooltipFilter^state): [EditorState](#state.EditorState)  ) → [Diagnostic](#lint.Diagnostic)[]`

Filter applied to a set of diagnostics shown in a tooltip. No tooltip will appear if the empty set is returned.

`**[hideOn](#lint.linter^config.hideOn)**⁠?: fn([tr](#lint.linter^config.hideOn^tr): [Transaction](#state.Transaction), [from](#lint.linter^config.hideOn^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#lint.linter^config.hideOn^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Can be used to control what kind of transactions cause lint hover tooltips associated with the given document range to be hidden. By default any transactions that changes the line around the range will hide it. Returning null falls back to this behavior.

`**[autoPanel](#lint.linter^config.autoPanel)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When enabled (defaults to off), this will cause the lint panel to automatically open when diagnostics are found, and close when all diagnostics are resolved or removed.

`type **[LintSource](#lint.LintSource)** = fn([view](#lint.LintSource^view): [EditorView](#view.EditorView)) → readonly [Diagnostic](#lint.Diagnostic)[] |  [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<readonly [Diagnostic](#lint.Diagnostic)[]>  `

The type of a function that produces diagnostics.

`**[diagnosticCount](#lint.diagnosticCount)**([state](#lint.diagnosticCount^state): [EditorState](#state.EditorState)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Returns the number of active lint diagnostics in the given state.

`**[forceLinting](#lint.forceLinting)**([view](#lint.forceLinting^view): [EditorView](#view.EditorView))`

Forces any linters [configured](#lint.linter) to run when the editor is idle to run right away.

`**[openLintPanel](#lint.openLintPanel)**: [Command](#view.Command)`

Command to open and focus the lint panel.

`**[closeLintPanel](#lint.closeLintPanel)**: [Command](#view.Command)`

Command to close the lint panel, when open.

`**[nextDiagnostic](#lint.nextDiagnostic)**: [Command](#view.Command)`

Move the selection to the next diagnostic.

`**[previousDiagnostic](#lint.previousDiagnostic)**: [Command](#view.Command)`

Move the selection to the previous diagnostic.

`**[setDiagnostics](#lint.setDiagnostics)**(  [state](#lint.setDiagnostics^state): [EditorState](#state.EditorState),  [diagnostics](#lint.setDiagnostics^diagnostics): readonly [Diagnostic](#lint.Diagnostic)[]  ) → [TransactionSpec](#state.TransactionSpec)`

Returns a transaction spec which updates the current set of diagnostics, and enables the lint extension if if wasn't already active.

`**[setDiagnosticsEffect](#lint.setDiagnosticsEffect)**: [StateEffectType](#state.StateEffectType)<readonly [Diagnostic](#lint.Diagnostic)[]>`

The state effect that updates the set of active diagnostics. Can be useful when writing an extension that needs to track these.

`**[forEachDiagnostic](#lint.forEachDiagnostic)**(  [state](#lint.forEachDiagnostic^state): [EditorState](#state.EditorState),  [f](#lint.forEachDiagnostic^f): fn([d](#lint.forEachDiagnostic^f^d): [Diagnostic](#lint.Diagnostic), [from](#lint.forEachDiagnostic^f^from): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [to](#lint.forEachDiagnostic^f^to): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))  )`

Iterate over the marked diagnostics for the given editor state, calling `f` for each of them. Note that, if the document changed since the diagnostics were created, the `Diagnostic` object will hold the original outdated position, whereas the `to` and `from` arguments hold the diagnostic's current position.

`**[lintGutter](#lint.lintGutter)**([config](#lint.lintGutter^config)⁠?: Object = {}) → [Extension](#state.Extension)`

Returns an extension that installs a gutter showing markers for each line that has diagnostics, which can be hovered over to see the diagnostics.

`**[config](#lint.lintGutter^config)**`

`**[hoverTime](#lint.lintGutter^config.hoverTime)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The delay before showing a tooltip when hovering over a lint gutter marker.

`**[markerFilter](#lint.lintGutter^config.markerFilter)**⁠?: fn(  [diagnostics](#lint.lintGutter^config.markerFilter^diagnostics): readonly [Diagnostic](#lint.Diagnostic)[],  [state](#lint.lintGutter^config.markerFilter^state): [EditorState](#state.EditorState)  ) → [Diagnostic](#lint.Diagnostic)[]`

Optional filter determining which diagnostics show a marker in the gutter.

`**[tooltipFilter](#lint.lintGutter^config.tooltipFilter)**⁠?: fn(  [diagnostics](#lint.lintGutter^config.tooltipFilter^diagnostics): readonly [Diagnostic](#lint.Diagnostic)[],  [state](#lint.lintGutter^config.tooltipFilter^state): [EditorState](#state.EditorState)  ) → [Diagnostic](#lint.Diagnostic)[]`

Optional filter for diagnostics displayed in a tooltip, which can also be used to prevent a tooltip appearing.

## [@codemirror/collab](#collab)

This package provides the scaffolding for basic operational-transform based collaborative editing. When it is enabled, the editor will accumulate [local changes](#collab.sendableUpdates), which can be sent to a central service. When new changes are received from the service, they can be applied to the state with [`receiveUpdates`](#collab.receiveUpdates).

See the [collaborative editing example](../../examples/collab) for a more detailed description of the protocol.

`**[collab](#collab.collab)**([config](#collab.collab^config)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [Extension](#state.Extension)`

Create an instance of the collaborative editing plugin.

`**[config](#collab.collab^config)**`

`**[startVersion](#collab.collab^config.startVersion)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The starting document version. Defaults to 0.

`**[clientID](#collab.collab^config.clientID)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

This client's identifying [ID](#collab.getClientID). Will be a randomly generated string if not provided.

`**[sharedEffects](#collab.collab^config.sharedEffects)**⁠?: fn([tr](#collab.collab^config.sharedEffects^tr): [Transaction](#state.Transaction)) → readonly [StateEffect](#state.StateEffect)<any>[]`

It is possible to share information other than document changes through this extension. If you provide this option, your function will be called on each transaction, and the effects it returns will be sent to the server, much like changes are. Such effects are automatically remapped when conflicting remote changes come in.

#### `interface` [Update](#collab.Update)

An update is a set of changes and effects.

`**[changes](#collab.Update.changes)**: [ChangeSet](#state.ChangeSet)`

The changes made by this update.

`**[effects](#collab.Update.effects)**⁠?: readonly [StateEffect](#state.StateEffect)<any>[]`

The effects in this update. There'll only ever be effects here when you configure your collab extension with a [`sharedEffects`](#collab.collab%5Econfig.sharedEffects) option.

`**[clientID](#collab.Update.clientID)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The [ID](#collab.collab%5Econfig.clientID) of the client who created this update.

`**[receiveUpdates](#collab.receiveUpdates)**([state](#collab.receiveUpdates^state): [EditorState](#state.EditorState), [updates](#collab.receiveUpdates^updates): readonly [Update](#collab.Update)[]) → [Transaction](#state.Transaction)`

Create a transaction that represents a set of new updates received from the authority. Applying this transaction moves the state forward to adjust to the authority's view of the document.

`**[sendableUpdates](#collab.sendableUpdates)**([state](#collab.sendableUpdates^state): [EditorState](#state.EditorState)) → readonly ([Update](#collab.Update) & {origin: [Transaction](#state.Transaction)})[]`

Returns the set of locally made updates that still have to be sent to the authority. The returned objects will also have an `origin` property that points at the transaction that created them. This may be useful if you want to send along metadata like timestamps. (But note that the updates may have been mapped in the meantime, whereas the transaction is just the original transaction that created them.)

`**[rebaseUpdates](#collab.rebaseUpdates)**(  [updates](#collab.rebaseUpdates^updates): readonly [Update](#collab.Update)[],  [over](#collab.rebaseUpdates^over): readonly {changes: [ChangeDesc](#state.ChangeDesc), clientID: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)}[]  ) → readonly [Update](#collab.Update)[]`

Rebase and deduplicate an array of client-submitted updates that came in with an out-of-date version number. `over` should hold the updates that were accepted since the given version (or at least their change descs and client IDs). Will return an array of updates that, firstly, has updates that were already accepted filtered out, and secondly, has been moved over the other changes so that they apply to the current document version.

`**[getSyncedVersion](#collab.getSyncedVersion)**([state](#collab.getSyncedVersion^state): [EditorState](#state.EditorState)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Get the version up to which the collab plugin has synced with the central authority.

`**[getClientID](#collab.getClientID)**([state](#collab.getClientID^state): [EditorState](#state.EditorState)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Get this editor's collaborative editing client ID.

## [@codemirror/language-data](#language-data)

`**[languages](#language-data.languages)**: [LanguageDescription](#language.LanguageDescription)[]`

An array of language descriptions for known language packages.

## [@codemirror/merge](#merge)

### Side-by-side Merge View

#### `interface` [MergeConfig](#merge.MergeConfig)

Configuration options to `MergeView` that can be provided both initially and to [`reconfigure`](#merge.MergeView.reconfigure).

`**[orientation](#merge.MergeConfig.orientation)**⁠?: "a-b" | "b-a"`

Controls whether editor A or editor B is shown first. Defaults to `"a-b"`.

`**[revertControls](#merge.MergeConfig.revertControls)**⁠?: "a-to-b" | "b-to-a"`

Controls whether revert controls are shown between changed chunks.

`**[renderRevertControl](#merge.MergeConfig.renderRevertControl)**⁠?: fn() → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

When given, this function is called to render the button to revert a chunk.

`**[highlightChanges](#merge.MergeConfig.highlightChanges)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, the merge view will mark inserted and deleted text in changed chunks. Set this to false to turn that off.

`**[gutter](#merge.MergeConfig.gutter)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Controls whether a gutter marker is shown next to changed lines.

`**[collapseUnchanged](#merge.MergeConfig.collapseUnchanged)**⁠?: {margin⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), minSize⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

When given, long stretches of unchanged text are collapsed. `margin` gives the number of lines to leave visible after/before a change (default is 3), and `minSize` gives the minimum amount of collapsible lines that need to be present (defaults to 4).

`**[diffConfig](#merge.MergeConfig.diffConfig)**⁠?: [DiffConfig](#merge.DiffConfig)`

Pass options to the diff algorithm. By default, the merge view sets [`scanLimit`](#merge.DiffConfig.scanLimit) to 500.

#### `interface` [DirectMergeConfig](#merge.DirectMergeConfig) `extends [MergeConfig](#merge.MergeConfig)`

Configuration options given to the [`MergeView`](#merge.MergeView) constructor.

`**[a](#merge.DirectMergeConfig.a)**: [EditorStateConfig](#state.EditorStateConfig)`

Configuration for the first editor (the left one in a left-to-right context).

`**[b](#merge.DirectMergeConfig.b)**: [EditorStateConfig](#state.EditorStateConfig)`

Configuration for the second editor.

`**[parent](#merge.DirectMergeConfig.parent)**⁠?: [Element](https://developer.mozilla.org/en/docs/DOM/Element) | [DocumentFragment](https://developer.mozilla.org/en/docs/DOM/document.createDocumentFragment)`

Parent element to append the view to.

`**[root](#merge.DirectMergeConfig.root)**⁠?: [Document](https://developer.mozilla.org/en/docs/DOM/document) | [ShadowRoot](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot)`

An optional root. Only necessary if the view is mounted in a shadow root or a document other than the global `document` object.

#### `class` [MergeView](#merge.MergeView)

A merge view manages two editors side-by-side, highlighting the difference between them and vertically aligning unchanged lines. If you want one of the editors to be read-only, you have to configure that in its extensions.

By default, views are not scrollable. Style them (`.cm-mergeView`) with a height and `overflow: auto` to make them scrollable.

`new **[MergeView](#merge.MergeView.constructor)**([config](#merge.MergeView.constructor^config): [DirectMergeConfig](#merge.DirectMergeConfig))`

Create a new merge view.

`**[a](#merge.MergeView.a)**: [EditorView](#view.EditorView)`

The first editor.

`**[b](#merge.MergeView.b)**: [EditorView](#view.EditorView)`

The second editor.

`**[dom](#merge.MergeView.dom)**: [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)`

The outer DOM element holding the view.

`**[chunks](#merge.MergeView.chunks)**: readonly [Chunk](#merge.Chunk)[]`

The current set of changed chunks.

`**[reconfigure](#merge.MergeView.reconfigure)**([config](#merge.MergeView.reconfigure^config): [MergeConfig](#merge.MergeConfig))`

Reconfigure an existing merge view.

`**[destroy](#merge.MergeView.destroy)**()`

Destroy this merge view.

`**[mergeViewSiblings](#merge.mergeViewSiblings)**([view](#merge.mergeViewSiblings^view): [EditorView](#view.EditorView)) → {a: [EditorView](#view.EditorView), b: [EditorView](#view.EditorView)} | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Query whether the given view is displayed next to another editor in a merge view. Returns `null` if it isn't, and a pair of editors (one of which will be the view itself) otherwise.

`**[uncollapseUnchanged](#merge.uncollapseUnchanged)**: [StateEffectType](#state.StateEffectType)<[number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)>`

A state effect that expands the section of collapsed unchanged code starting at the given position.

### Unified Merge View

`**[unifiedMergeView](#merge.unifiedMergeView)**([config](#merge.unifiedMergeView^config): Object) → ([Extension](#state.Extension) | [StateField](#state.StateField)<[DecorationSet](#view.DecorationSet)>)[]`

Create an extension that causes the editor to display changes between its content and the given original document. Changed chunks will be highlighted, with uneditable widgets displaying the original text displayed above the new text.

`**[config](#merge.unifiedMergeView^config)**`

`**[original](#merge.unifiedMergeView^config.original)**: [Text](#state.Text) | [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The other document to compare the editor content with.

`**[highlightChanges](#merge.unifiedMergeView^config.highlightChanges)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, the merge view will mark inserted and deleted text in changed chunks. Set this to false to turn that off.

`**[gutter](#merge.unifiedMergeView^config.gutter)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Controls whether a gutter marker is shown next to changed lines.

`**[syntaxHighlightDeletions](#merge.unifiedMergeView^config.syntaxHighlightDeletions)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, deleted chunks are highlighted using the main editor's language. Since these are just fragments, not full documents, this doesn't always work well. Set this option to false to disable syntax highlighting for deleted lines.

`**[allowInlineDiffs](#merge.unifiedMergeView^config.allowInlineDiffs)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

When enabled (off by default), chunks that look like they contain only inline changes will have the changes displayed inline, rather than as separate deleted/inserted lines.

`**[syntaxHighlightDeletionsMaxLength](#merge.unifiedMergeView^config.syntaxHighlightDeletionsMaxLength)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Deleted blocks larger than this size do not get syntax-highlighted. Defaults to 3000.

`**[mergeControls](#merge.unifiedMergeView^config.mergeControls)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) |  fn([type](#merge.unifiedMergeView^config.mergeControls^type): "reject" | "accept", [action](#merge.unifiedMergeView^config.mergeControls^action): fn([e](#merge.unifiedMergeView^config.mergeControls^action^e): [MouseEvent](https://developer.mozilla.org/en/docs/DOM/MouseEvent))) → [HTMLElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement)  `

Controls whether accept/reject buttons are displayed for each changed chunk. Defaults to true. When set to a function, that function is used to render the buttons.

`**[diffConfig](#merge.unifiedMergeView^config.diffConfig)**⁠?: [DiffConfig](#merge.DiffConfig)`

Pass options to the diff algorithm. By default, the merge view sets [`scanLimit`](#merge.DiffConfig.scanLimit) to 500.

`**[collapseUnchanged](#merge.unifiedMergeView^config.collapseUnchanged)**⁠?: {margin⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), minSize⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)}`

When given, long stretches of unchanged text are collapsed. `margin` gives the number of lines to leave visible after/before a change (default is 3), and `minSize` gives the minimum amount of collapsible lines that need to be present (defaults to 4).

`**[acceptChunk](#merge.acceptChunk)**([view](#merge.acceptChunk^view): [EditorView](#view.EditorView), [pos](#merge.acceptChunk^pos)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

In a [unified](#merge.unifiedMergeView) merge view, accept the chunk under the given position or the cursor. This chunk will no longer be highlighted unless it is edited again.

`**[rejectChunk](#merge.rejectChunk)**([view](#merge.rejectChunk^view): [EditorView](#view.EditorView), [pos](#merge.rejectChunk^pos)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

In a [unified](#merge.unifiedMergeView) merge view, reject the chunk under the given position or the cursor. Reverts that range to the content it has in the original document.

`**[getOriginalDoc](#merge.getOriginalDoc)**([state](#merge.getOriginalDoc^state): [EditorState](#state.EditorState)) → [Text](#state.Text)`

Get the original document from a unified merge editor's state.

`**[originalDocChangeEffect](#merge.originalDocChangeEffect)**([state](#merge.originalDocChangeEffect^state): [EditorState](#state.EditorState), [changes](#merge.originalDocChangeEffect^changes): [ChangeSet](#state.ChangeSet)) → [StateEffect](#state.StateEffect)<{doc: [Text](#state.Text), changes: [ChangeSet](#state.ChangeSet)}>`

Create an effect that, when added to a transaction on a unified merge view, will update the original document that's being compared against.

`**[updateOriginalDoc](#merge.updateOriginalDoc)**: [StateEffectType](#state.StateEffectType)<{doc: [Text](#state.Text), changes: [ChangeSet](#state.ChangeSet)}>`

The state effect used to signal changes in the original doc in a unified merge view.

### Chunks

#### `class` [Chunk](#merge.Chunk)

A chunk describes a range of lines which have changed content in them. Either side (a/b) may either be empty (when its `to` is equal to its `from`), or points at a range starting at the start of the first changed line, to 1 past the end of the last changed line. Note that `to` positions may point past the end of the document. Use `endA`/`endB` if you need an end position that is certain to be a valid document position.

`new **[Chunk](#merge.Chunk.constructor)**(  [changes](#merge.Chunk.constructor^changes): readonly [Change](#merge.Change)[],  [fromA](#merge.Chunk.constructor^fromA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [toA](#merge.Chunk.constructor^toA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [fromB](#merge.Chunk.constructor^fromB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [toB](#merge.Chunk.constructor^toB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [precise](#merge.Chunk.constructor^precise)⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean) = true  )`

`**[changes](#merge.Chunk.changes)**: readonly [Change](#merge.Change)[]`

The individual changes inside this chunk. These are stored relative to the start of the chunk, so you have to add `chunk.fromA`/`fromB` to get document positions.

`**[fromA](#merge.Chunk.fromA)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the chunk in document A.

`**[toA](#merge.Chunk.toA)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the chunk in document A. This is equal to `fromA` when the chunk covers no lines in document A, or is one unit past the end of the last line in the chunk if it does. (Note that this may point outside the document if the chunk ends at the end of the last line. See also `endA`.)

`**[fromB](#merge.Chunk.fromB)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the chunk in document B.

`**[toB](#merge.Chunk.toB)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the chunk in document A.

`**[precise](#merge.Chunk.precise)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

This is set to false when the diff used to compute this chunk fell back to fast, imprecise diffing.

`**[endA](#merge.Chunk.endA)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Returns `fromA` if the chunk is empty in A, or the end of the last line in the chunk otherwise.

`**[endB](#merge.Chunk.endB)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Returns `fromB` if the chunk is empty in B, or the end of the last line in the chunk otherwise.

`static **[build](#merge.Chunk^build)**([a](#merge.Chunk^build^a): [Text](#state.Text), [b](#merge.Chunk^build^b): [Text](#state.Text), [conf](#merge.Chunk^build^conf)⁠?: [DiffConfig](#merge.DiffConfig)) → readonly [Chunk](#merge.Chunk)[]`

Build a set of changed chunks for the given documents.

`static **[updateA](#merge.Chunk^updateA)**(  [chunks](#merge.Chunk^updateA^chunks): readonly [Chunk](#merge.Chunk)[],  [a](#merge.Chunk^updateA^a): [Text](#state.Text),  [b](#merge.Chunk^updateA^b): [Text](#state.Text),  [changes](#merge.Chunk^updateA^changes): [ChangeDesc](#state.ChangeDesc),  [conf](#merge.Chunk^updateA^conf)⁠?: [DiffConfig](#merge.DiffConfig)  ) → readonly [Chunk](#merge.Chunk)[]`

Update a set of chunks for changes in document A. `a` should hold the updated document A.

`static **[updateB](#merge.Chunk^updateB)**(  [chunks](#merge.Chunk^updateB^chunks): readonly [Chunk](#merge.Chunk)[],  [a](#merge.Chunk^updateB^a): [Text](#state.Text),  [b](#merge.Chunk^updateB^b): [Text](#state.Text),  [changes](#merge.Chunk^updateB^changes): [ChangeDesc](#state.ChangeDesc),  [conf](#merge.Chunk^updateB^conf)⁠?: [DiffConfig](#merge.DiffConfig)  ) → readonly [Chunk](#merge.Chunk)[]`

Update a set of chunks for changes in document B.

`**[getChunks](#merge.getChunks)**([state](#merge.getChunks^state): [EditorState](#state.EditorState)) → {chunks: readonly [Chunk](#merge.Chunk)[], side: "a" | "b" | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)} |  [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)  `

Get the changed chunks for the merge view that this editor is part of, plus the side it is on if it is part of a `MergeView`. Returns null if the editor doesn't have a merge extension active or the merge view hasn't finished initializing yet.

`**[goToNextChunk](#merge.goToNextChunk)**: [StateCommand](#state.StateCommand)`

Move the selection to the next changed chunk.

`**[goToPreviousChunk](#merge.goToPreviousChunk)**: [StateCommand](#state.StateCommand)`

Move the selection to the previous changed chunk.

### Diffing Utilities

#### `class` [Change](#merge.Change)

A changed range.

`new **[Change](#merge.Change.constructor)**([fromA](#merge.Change.constructor^fromA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [toA](#merge.Change.constructor^toA): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [fromB](#merge.Change.constructor^fromB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [toB](#merge.Change.constructor^toB): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number))`

`**[fromA](#merge.Change.fromA)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the change in document A.

`**[toA](#merge.Change.toA)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the change in document A. This is equal to `fromA` in case of insertions.

`**[fromB](#merge.Change.fromB)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The start of the change in document B.

`**[toB](#merge.Change.toB)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The end of the change in document B. This is equal to `fromB` for deletions.

`**[diff](#merge.diff)**([a](#merge.diff^a): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [b](#merge.diff^b): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [config](#merge.diff^config)⁠?: [DiffConfig](#merge.DiffConfig)) → readonly [Change](#merge.Change)[]`

Compute the difference between two strings.

`**[presentableDiff](#merge.presentableDiff)**([a](#merge.presentableDiff^a): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [b](#merge.presentableDiff^b): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [config](#merge.presentableDiff^config)⁠?: [DiffConfig](#merge.DiffConfig)) → readonly [Change](#merge.Change)[]`

Compute the difference between the given strings, and clean up the resulting diff for presentation to users by dropping short unchanged ranges, and aligning changes to word boundaries when appropriate.

#### `interface` [DiffConfig](#merge.DiffConfig)

Options passed to diffing functions.

`**[scanLimit](#merge.DiffConfig.scanLimit)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

When given, this limits the depth of full (expensive) diff computations, causing them to give up and fall back to a faster but less precise approach when there is more than this many changed characters in a scanned range. This should help avoid quadratic running time on large, very different inputs.

`**[timeout](#merge.DiffConfig.timeout)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

When set, this makes the algorithm periodically check how long it has been running, and if it has taken more than the given number of milliseconds, it aborts detailed diffing in falls back to the imprecise algorithm.

`**[override](#merge.DiffConfig.override)**⁠?: fn([a](#merge.DiffConfig.override^a): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [b](#merge.DiffConfig.override^b): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → readonly [Change](#merge.Change)[]`

Provide your own diff algorithm, replacing this package's `diff` function.

## [@codemirror/lsp-client](#lsp-client)

### Client

#### `class` [LSPClient](#lsp-client.LSPClient)

An LSP client manages a connection to a language server. It should be explicitly [connected](#lsp-client.LSPClient.connect) before use.

`new **[LSPClient](#lsp-client.LSPClient.constructor)**([config](#lsp-client.LSPClient.constructor^config)⁠?: [LSPClientConfig](#lsp-client.LSPClientConfig) = {})`

Create a client object.

`**[workspace](#lsp-client.LSPClient.workspace)**: [Workspace](#lsp-client.Workspace)`

The client's [workspace](#lsp-client.Workspace).

`**[serverCapabilities](#lsp-client.LSPClient.serverCapabilities)**: [ServerCapabilities](https://microsoft.github.io/language-server-protocol/specifications/specification-current#serverCapabilities) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

The capabilities advertised by the server. Will be null when not connected or initialized.

`**[initializing](#lsp-client.LSPClient.initializing)**: [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

A promise that resolves once the client connection is initialized. Will be replaced by a new promise object when you call `disconnect`.

`**[connected](#lsp-client.LSPClient.connected)**: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

Whether this client is connected (has a transport).

`**[connect](#lsp-client.LSPClient.connect)**([transport](#lsp-client.LSPClient.connect^transport): [Transport](#lsp-client.Transport)) → [LSPClient](#lsp-client.LSPClient)`

Connect this client to a server over the given transport. Will immediately start the initialization exchange with the server, and resolve `this.initializing` (which it also returns) when successful.

`**[disconnect](#lsp-client.LSPClient.disconnect)**()`

Disconnect the client from the server.

`**[plugin](#lsp-client.LSPClient.plugin)**([fileURI](#lsp-client.LSPClient.plugin^fileURI): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [languageID](#lsp-client.LSPClient.plugin^languageID)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Extension](#state.Extension)`

Create a plugin for this client, to add to an editor configuration. This extension is necessary to use LSP-related functionality exported by this package. The returned extension will include the editor extensions included in this client's [configuration](#lsp-client.LSPClientConfig.extensions).

Creating an editor with this plugin will cause [`openFile`](#lsp-client.Workspace.openFile) to be called on the workspace.

By default, the language ID given to the server for this file is derived from the editor's language configuration via [`Language.name`](#language.Language.name). You can pass in a specific ID as a third parameter.

`**[didOpen](#lsp-client.LSPClient.didOpen)**([file](#lsp-client.LSPClient.didOpen^file): [WorkspaceFile](#lsp-client.WorkspaceFile))`

Send a `textDocument/didOpen` notification to the server.

`**[didClose](#lsp-client.LSPClient.didClose)**([uri](#lsp-client.LSPClient.didClose^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String))`

Send a `textDocument/didClose` notification to the server.

`**[request](#lsp-client.LSPClient.request)**<[Params](#lsp-client.LSPClient.request^Params), [Result](#lsp-client.LSPClient.request^Result)>([method](#lsp-client.LSPClient.request^method): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [params](#lsp-client.LSPClient.request^params): [Params](#lsp-client.LSPClient.request^Params)) → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Result](#lsp-client.LSPClient.request^Result)>`

Make a request to the server. Returns a promise that resolves to the response or rejects with a failure message. You'll probably want to use types from the `vscode-languageserver-protocol` package for the type parameters.

The caller is responsible for [synchronizing](#lsp-client.LSPClient.sync) state before the request and correctly handling state drift caused by local changes that happend during the request.

`**[notification](#lsp-client.LSPClient.notification)**<[Params](#lsp-client.LSPClient.notification^Params)>([method](#lsp-client.LSPClient.notification^method): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [params](#lsp-client.LSPClient.notification^params): [Params](#lsp-client.LSPClient.notification^Params))`

Send a notification to the server.

`**[cancelRequest](#lsp-client.LSPClient.cancelRequest)**([params](#lsp-client.LSPClient.cancelRequest^params): any)`

Cancel the in-progress request with the given parameter value (which is compared by identity).

`**[workspaceMapping](#lsp-client.LSPClient.workspaceMapping)**() → [WorkspaceMapping](#lsp-client.WorkspaceMapping)`

Create a [workspace mapping](#lsp-client.WorkspaceMapping) that tracks changes to files in this client's workspace, relative to the moment where it was created. Make sure you call [`destroy`](#lsp-client.WorkspaceMapping.destroy) on the mapping when you're done with it.

`**[withMapping](#lsp-client.LSPClient.withMapping)**<[T](#lsp-client.LSPClient.withMapping^T)>([f](#lsp-client.LSPClient.withMapping^f): fn([mapping](#lsp-client.LSPClient.withMapping^f^mapping): [WorkspaceMapping](#lsp-client.WorkspaceMapping)) → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[T](#lsp-client.LSPClient.withMapping^T)>) → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[T](#lsp-client.LSPClient.withMapping^T)>`

Run the given promise with a [workspace mapping](#lsp-client.WorkspaceMapping) active. Automatically release the mapping when the promise resolves or rejects.

`**[sync](#lsp-client.LSPClient.sync)**()`

Push any [pending changes](#lsp-client.Workspace.syncFiles) in the open files to the server. You'll want to call this before most types of requests, to make sure the server isn't working with outdated information.

#### `type` [LSPClientConfig](#lsp-client.LSPClientConfig)

Configuration options that can be passed to the LSP client.

`**[rootUri](#lsp-client.LSPClientConfig.rootUri)**⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The project root URI passed to the server, when necessary.

`**[workspace](#lsp-client.LSPClientConfig.workspace)**⁠?: fn([client](#lsp-client.LSPClientConfig.workspace^client): [LSPClient](#lsp-client.LSPClient)) → [Workspace](#lsp-client.Workspace)`

An optional function to create a [workspace](#lsp-client.Workspace) object for the client to use. When not given, this will default to a simple workspace that only opens files that have an active editor, and only allows one editor per file.

`**[timeout](#lsp-client.LSPClientConfig.timeout)**⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The amount of milliseconds after which requests are automatically timed out. Defaults to 3000.

`**[sanitizeHTML](#lsp-client.LSPClientConfig.sanitizeHTML)**⁠?: fn([html](#lsp-client.LSPClientConfig.sanitizeHTML^html): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

LSP servers can send Markdown code, which the client must render and display as HTML. Markdown can contain arbitrary HTML and is thus a potential channel for cross-site scripting attacks, if someone is able to compromise your LSP server or your connection to it. You can pass an HTML sanitizer here to strip out suspicious HTML structure.

`**[highlightLanguage](#lsp-client.LSPClientConfig.highlightLanguage)**⁠?: fn([name](#lsp-client.LSPClientConfig.highlightLanguage^name): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Language](#language.Language) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

By default, the Markdown renderer will only be able to highlght code embedded in the Markdown text when its language tag matches the name of the language used by the editor. You can provide a function here that returns a CodeMirror language object for a given language tag to support more languages.

`**[notificationHandlers](#lsp-client.LSPClientConfig.notificationHandlers)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<fn([client](#lsp-client.LSPClientConfig.notificationHandlers^client): [LSPClient](#lsp-client.LSPClient), [params](#lsp-client.LSPClientConfig.notificationHandlers^params): any) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

By default, the client will only handle the server notifications `window/logMessage` (logging warnings and errors to the console) and `window/showMessage`. You can pass additional handlers here. They will be tried before the built-in handlers, and override those when they return true.

`**[unhandledNotification](#lsp-client.LSPClientConfig.unhandledNotification)**⁠?: fn([client](#lsp-client.LSPClientConfig.unhandledNotification^client): [LSPClient](#lsp-client.LSPClient), [method](#lsp-client.LSPClientConfig.unhandledNotification^method): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [params](#lsp-client.LSPClientConfig.unhandledNotification^params): any)`

When no handler is found for a notification, it will be passed to this function, if given.

`**[extensions](#lsp-client.LSPClientConfig.extensions)**⁠?: readonly ([Extension](#state.Extension) | [LSPClientExtension](#lsp-client.LSPClientExtension))[]`

Provide a set of extensions, which may be plain CodeMirror extensions, or objects containing additional client capabilities or notification handlers. Any CodeMirror extensions provided here will be included in the extension returned by [`LSPPlugin.create`](#lsp-client.LSPPlugin%5Ecreate).

#### `type` [LSPClientExtension](#lsp-client.LSPClientExtension)

Objects of this type can be included in the [`extensions`](#lsp-client.LSPClientConfig.extensions) option to `LSPClient` to modularly configure client capabilities or notification handlers.

`**[clientCapabilities](#lsp-client.LSPClientExtension.clientCapabilities)**⁠?: [Record](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeystype)<[string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), any>`

Extra [client capabilities](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#clientCapabilities) to send to the server when initializing. The object provided here will be merged with the capabilities the client provides by default.

`**[notificationHandlers](#lsp-client.LSPClientExtension.notificationHandlers)**⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object)<fn([client](#lsp-client.LSPClientExtension.notificationHandlers^client): [LSPClient](#lsp-client.LSPClient), [params](#lsp-client.LSPClientExtension.notificationHandlers^params): any) → [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)>`

Additional [notification handlers](#lsp-client.LSPClientConfig.notificationHandlers). These will be tried after notification handlers defined directly in the config object, and then in order of appearance in the [`extensions`](#lsp-client.LSPClientConfig.extensions) array.

`**[editorExtension](#lsp-client.LSPClientExtension.editorExtension)**⁠?: [Extension](#state.Extension)`

An optional CodeMirror extension to include.

#### `type` [Transport](#lsp-client.Transport)

An object of this type should be used to wrap whatever transport layer you use to talk to your language server. Messages should contain only the JSON messages, no LSP headers.

`**[send](#lsp-client.Transport.send)**([message](#lsp-client.Transport.send^message): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String))`

Send a message to the server. Should throw if the connection is broken somehow.

`**[subscribe](#lsp-client.Transport.subscribe)**([handler](#lsp-client.Transport.subscribe^handler): fn([value](#lsp-client.Transport.subscribe^handler^value): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)))`

Register a handler for messages coming from the server.

`**[unsubscribe](#lsp-client.Transport.unsubscribe)**([handler](#lsp-client.Transport.unsubscribe^handler): fn([value](#lsp-client.Transport.unsubscribe^handler^value): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)))`

Unregister a handler registered with `subscribe`.

#### `class` [LSPPlugin](#lsp-client.LSPPlugin)

A plugin that connects a given editor to a language server client.

`**[client](#lsp-client.LSPPlugin.client)**: [LSPClient](#lsp-client.LSPClient)`

The client connection.

`**[uri](#lsp-client.LSPPlugin.uri)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The URI of this file.

`**[view](#lsp-client.LSPPlugin.view)**: [EditorView](#view.EditorView)`

The editor view that this plugin belongs to.

`**[docToHTML](#lsp-client.LSPPlugin.docToHTML)**(  [value](#lsp-client.LSPPlugin.docToHTML^value): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String) | [MarkupContent](https://microsoft.github.io/language-server-protocol/specifications/specification-current#markupContent),  [defaultKind](#lsp-client.LSPPlugin.docToHTML^defaultKind)⁠?: [MarkupKind](https://microsoft.github.io/language-server-protocol/specifications/specification-current#markupKind) = "plaintext"  ) → [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

Render a doc string from the server to HTML.

`**[toPosition](#lsp-client.LSPPlugin.toPosition)**([pos](#lsp-client.LSPPlugin.toPosition^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [doc](#lsp-client.LSPPlugin.toPosition^doc)⁠?: [Text](#state.Text) = this.view.state.doc) → [Position](https://microsoft.github.io/language-server-protocol/specifications/specification-current#position)`

Convert a CodeMirror document offset into an LSP `{line, character}` object. Defaults to using the view's current document, but can be given another one.

`**[fromPosition](#lsp-client.LSPPlugin.fromPosition)**([pos](#lsp-client.LSPPlugin.fromPosition^pos): [Position](https://microsoft.github.io/language-server-protocol/specifications/specification-current#position), [doc](#lsp-client.LSPPlugin.fromPosition^doc)⁠?: [Text](#state.Text) = this.view.state.doc) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

Convert an LSP `{line, character}` object to a CodeMirror document offset.

`**[reportError](#lsp-client.LSPPlugin.reportError)**([message](#lsp-client.LSPPlugin.reportError^message): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [err](#lsp-client.LSPPlugin.reportError^err): any)`

Display an error in this plugin's editor.

`**[syncedDoc](#lsp-client.LSPPlugin.syncedDoc)**: [Text](#state.Text)`

The version of the document that was synchronized to the server.

`**[unsyncedChanges](#lsp-client.LSPPlugin.unsyncedChanges)**: [ChangeSet](#state.ChangeSet)`

The changes accumulated in this editor that have not been sent to the server yet.

`**[clear](#lsp-client.LSPPlugin.clear)**()`

Reset the [unsynced changes](#lsp-client.LSPPlugin.unsyncedChanges). Should probably only be called by a [workspace](#lsp-client.Workspace).

`static **[get](#lsp-client.LSPPlugin^get)**([view](#lsp-client.LSPPlugin^get^view): [EditorView](#view.EditorView)) → [LSPPlugin](#lsp-client.LSPPlugin) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the LSP plugin associated with an editor, if any.

`static **[create](#lsp-client.LSPPlugin^create)**([client](#lsp-client.LSPPlugin^create^client): [LSPClient](#lsp-client.LSPClient), [fileURI](#lsp-client.LSPPlugin^create^fileURI): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [languageID](#lsp-client.LSPPlugin^create^languageID)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Extension](#state.Extension)`

Deprecated. Use [`LSPClient.plugin`](#lsp-client.LSPClient.plugin) instead.

#### `class` [WorkspaceMapping](#lsp-client.WorkspaceMapping)

A workspace mapping is used to track changes made to open documents, so that positions returned by a request can be interpreted in terms of the current, potentially changed document.

`**[getMapping](#lsp-client.WorkspaceMapping.getMapping)**([uri](#lsp-client.WorkspaceMapping.getMapping^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [ChangeDesc](#state.ChangeDesc) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get the changes made to the document with the given URI since the mapping was created. Returns null for documents that aren't open.

`**[mapPos](#lsp-client.WorkspaceMapping.mapPos)**([uri](#lsp-client.WorkspaceMapping.mapPos^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [pos](#lsp-client.WorkspaceMapping.mapPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [assoc](#lsp-client.WorkspaceMapping.mapPos^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[mapPos](#lsp-client.WorkspaceMapping.mapPos)**([uri](#lsp-client.WorkspaceMapping.mapPos^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [pos](#lsp-client.WorkspaceMapping.mapPos^pos): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [assoc](#lsp-client.WorkspaceMapping.mapPos^assoc): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number), [mode](#lsp-client.WorkspaceMapping.mapPos^mode): [MapMode](#state.MapMode)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Map a position in the given file forward to the current document state.

`**[mapPosition](#lsp-client.WorkspaceMapping.mapPosition)**([uri](#lsp-client.WorkspaceMapping.mapPosition^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [pos](#lsp-client.WorkspaceMapping.mapPosition^pos): [Position](https://microsoft.github.io/language-server-protocol/specifications/specification-current#position), [assoc](#lsp-client.WorkspaceMapping.mapPosition^assoc)⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

`**[mapPosition](#lsp-client.WorkspaceMapping.mapPosition)**(  [uri](#lsp-client.WorkspaceMapping.mapPosition^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String),  [pos](#lsp-client.WorkspaceMapping.mapPosition^pos): [Position](https://microsoft.github.io/language-server-protocol/specifications/specification-current#position),  [assoc](#lsp-client.WorkspaceMapping.mapPosition^assoc): [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number),  [mode](#lsp-client.WorkspaceMapping.mapPosition^mode): [MapMode](#state.MapMode)  ) → [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Convert an LSP-style position referring to a document at the time the mapping was created to an offset in the current document.

`**[destroy](#lsp-client.WorkspaceMapping.destroy)**()`

Disconnect this mapping from the client so that it will no longer be notified of new changes. You must make sure to call this on every mapping you create, except when you use [`withMapping`](#lsp-client.LSPClient.withMapping), which will automatically schedule a disconnect when the given promise resolves or aborts.

### Workspaces

#### `abstract class` [Workspace](#lsp-client.Workspace)

Implementing your own workspace class can provide more control over the way files are loaded and managed when interacting with the language server. See [`LSPClientConfig.workspace`](#lsp-client.LSPClientConfig.workspace).

`new **[Workspace](#lsp-client.Workspace.constructor)**([client](#lsp-client.Workspace.constructor^client): [LSPClient](#lsp-client.LSPClient))`

The constructor, as called by the client when creating a workspace.

`abstract **[files](#lsp-client.Workspace.files)**: [WorkspaceFile](#lsp-client.WorkspaceFile)[]`

The files currently open in the workspace.

`**[client](#lsp-client.Workspace.client)**: [LSPClient](#lsp-client.LSPClient)`

The LSP client associated with this workspace.

`**[getFile](#lsp-client.Workspace.getFile)**([uri](#lsp-client.Workspace.getFile^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [WorkspaceFile](#lsp-client.WorkspaceFile) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Find the open file with the given URI, if it exists. The default implementation just looks it up in `this.files`.

`abstract **[syncFiles](#lsp-client.Workspace.syncFiles)**() → readonly {file: [WorkspaceFile](#lsp-client.WorkspaceFile), prevDoc: [Text](#state.Text), changes: [ChangeSet](#state.ChangeSet)}[]`

Check all open files for changes (usually from editors, but they may also come from other sources). When a file is changed, return a record that describes the changes, and update the file's [`version`](#lsp-client.WorkspaceFile.version) and [`doc`](#lsp-client.WorkspaceFile.doc) properties to reflect the new version.

`**[requestFile](#lsp-client.Workspace.requestFile)**([uri](#lsp-client.Workspace.requestFile^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[WorkspaceFile](#lsp-client.WorkspaceFile) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

Called to request that the workspace open a file. The default implementation simply returns the file if it is open, null otherwise.

`abstract **[openFile](#lsp-client.Workspace.openFile)**([uri](#lsp-client.Workspace.openFile^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [languageId](#lsp-client.Workspace.openFile^languageId): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [view](#lsp-client.Workspace.openFile^view): [EditorView](#view.EditorView))`

Called when an editor is created for a file. The implementation should track the file in [`this.files`](#lsp-client.Workspace.files) and, if it wasn't open already, call [`LSPClient.didOpen`](#lsp-client.LSPClient.didOpen).

`abstract **[closeFile](#lsp-client.Workspace.closeFile)**([uri](#lsp-client.Workspace.closeFile^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [view](#lsp-client.Workspace.closeFile^view): [EditorView](#view.EditorView))`

Called when an editor holding this file is destroyed or reconfigured to no longer hold it. The implementation should track this and, when it closes the file, make sure to call [`LSPClient.didClose`](#lsp-client.LSPClient.didClose).

`**[connected](#lsp-client.Workspace.connected)**()`

Called when the client for this workspace is connected. The default implementation calls [`LSPClient.didOpen`](#lsp-client.LSPClient.didOpen) on all open files.

`**[disconnected](#lsp-client.Workspace.disconnected)**()`

Called when the client for this workspace is disconnected. The default implementation does nothing.

`**[updateFile](#lsp-client.Workspace.updateFile)**([uri](#lsp-client.Workspace.updateFile^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [update](#lsp-client.Workspace.updateFile^update): [TransactionSpec](#state.TransactionSpec))`

Called when a server-initiated change to a file is applied. The default implementation simply dispatches the update to the file's view, if the file is open and has a view.

`**[displayFile](#lsp-client.Workspace.displayFile)**([uri](#lsp-client.Workspace.displayFile^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[EditorView](#view.EditorView) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)>`

When the client needs to put a file other than the one loaded in the current editor in front of the user, for example in [`jumpToDefinition`](#lsp-client.jumpToDefinition), it will call this function. It should make sure to create or find an editor with the file and make it visible to the user, or return null if this isn't possible.

#### `interface` [WorkspaceFile](#lsp-client.WorkspaceFile)

A file that is open in a workspace.

`**[uri](#lsp-client.WorkspaceFile.uri)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The file's unique URI.

`**[languageId](#lsp-client.WorkspaceFile.languageId)**: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)`

The LSP language ID for the file's content.

`**[version](#lsp-client.WorkspaceFile.version)**: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)`

The current version of the file.

`**[doc](#lsp-client.WorkspaceFile.doc)**: [Text](#state.Text)`

The document corresponding to `this.version`. Will not reflect changes made after that version was synchronized. Will be updated, along with `version`, by [`syncFiles`](#lsp-client.Workspace.syncFiles).

`**[getView](#lsp-client.WorkspaceFile.getView)**([main](#lsp-client.WorkspaceFile.getView^main)⁠?: [EditorView](#view.EditorView)) → [EditorView](#view.EditorView) | [null](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null)`

Get an active editor view for this file, if there is one. For workspaces that support multiple views on a file, `main` indicates a preferred view.

### Extensions

`**[languageServerExtensions](#lsp-client.languageServerExtensions)**() → readonly ([Extension](#state.Extension) | [LSPClientExtension](#lsp-client.LSPClientExtension))[]`

This function bundles all the extensions defined in this package, in a way that can be passed to the [`extensions`](#lsp-client.LSPClientConfig.extensions) option to `LSPClient`.

`**[languageServerSupport](#lsp-client.languageServerSupport)**([client](#lsp-client.languageServerSupport^client): [LSPClient](#lsp-client.LSPClient), [uri](#lsp-client.languageServerSupport^uri): [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String), [languageID](#lsp-client.languageServerSupport^languageID)⁠?: [string](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String)) → [Extension](#state.Extension)`

Returns an extension that enables the [LSP plugin](#lsp-client.LSPPlugin) as well as LSP based autocompletion, hover tooltips, and signature help, along with the keymaps for reformatting, renaming symbols, jumping to definition, and finding references.

This function is deprecated. Prefer to directly use [`LSPPlugin.create`](#lsp-client.LSPPlugin%5Ecreate) and either add the extensions you need directly, or configure them in the client via [`languageServerExtensions`](#lsp-client.languageServerExtensions).

`**[serverCompletion](#lsp-client.serverCompletion)**([config](#lsp-client.serverCompletion^config)⁠?: [Object](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object) = {}) → [Extension](#state.Extension)`

Register the [language server completion source](#lsp-client.serverCompletionSource) as an autocompletion source.

`**[config](#lsp-client.serverCompletion^config)**`

`**[override](#lsp-client.serverCompletion^config.override)**⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)`

By default, the completion source that asks the language server for completions is added as a regular source, in addition to any other sources. Set this to true to make it replace all completion sources.

`**[validFor](#lsp-client.serverCompletion^config.validFor)**⁠?: [RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp)`

Set a custom [`validFor`](#autocomplete.CompletionResult.validFor) expression to use in the completion results. By default, the library uses an expression that accepts word characters, optionally prefixed by any non-word prefixes found in the results.

`**[serverCompletionSource](#lsp-client.serverCompletionSource)**: [CompletionSource](#autocomplete.CompletionSource)`

A completion source that requests completions from a language server.

`**[serverDiagnostics](#lsp-client.serverDiagnostics)**() → [LSPClientExtension](#lsp-client.LSPClientExtension)`

`**[hoverTooltips](#lsp-client.hoverTooltips)**([config](#lsp-client.hoverTooltips^config)⁠?: {hoverTime⁠?: [number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)} = {}) → [Extension](#state.Extension)`

Create an extension that queries the language server for hover tooltips when the user hovers over the code with their pointer, and displays a tooltip when the server provides one.

`**[formatDocument](#lsp-client.formatDocument)**: [Command](#view.Command)`

This command asks the language server to reformat the document, and then applies the changes it returns.

`**[formatKeymap](#lsp-client.formatKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

A keymap that binds Shift-Alt-f to [`formatDocument`](#lsp-client.formatDocument).

`**[renameSymbol](#lsp-client.renameSymbol)**: [Command](#view.Command)`

This command will, if the cursor is over a word, prompt the user for a new name for that symbol, and ask the language server to perform a rename of that symbol.

Note that this may affect files other than the one loaded into this view. See the [`Workspace.updateFile`](#lsp-client.Workspace.updateFile) method.

`**[renameKeymap](#lsp-client.renameKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

A keymap that binds F2 to [`renameSymbol`](#lsp-client.renameSymbol).

`**[signatureHelp](#lsp-client.signatureHelp)**([config](#lsp-client.signatureHelp^config)⁠?: {keymap⁠?: [boolean](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Boolean)} = {}) → [Extension](#state.Extension)`

Returns an extension that enables signature help. Will bind the keys in [`signatureKeymap`](#lsp-client.signatureKeymap) unless `keymap` is set to `false`.

`**[showSignatureHelp](#lsp-client.showSignatureHelp)**: [Command](#view.Command)`

Explicitly prompt the server to provide signature help at the cursor.

`**[nextSignature](#lsp-client.nextSignature)**: [Command](#view.Command)`

If there is an active signature tooltip with multiple signatures, move to the next one.

`**[prevSignature](#lsp-client.prevSignature)**: [Command](#view.Command)`

If there is an active signature tooltip with multiple signatures, move to the previous signature.

`**[signatureKeymap](#lsp-client.signatureKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

A keymap that binds

*   Ctrl-Shift-Space (Cmd-Shift-Space on macOS) to [`showSignatureHelp`](#lsp-client.showSignatureHelp)
    
*   Ctrl-Shift-ArrowUp (Cmd-Shift-ArrowUp on macOS) to [`prevSignature`](#lsp-client.prevSignature)
    
*   Ctrl-Shift-ArrowDown (Cmd-Shift-ArrowDown on macOS) to [`nextSignature`](#lsp-client.nextSignature)
    

Note that these keys are automatically bound by [`signatureHelp`](#lsp-client.signatureHelp) unless you pass it `keymap: false`.

`**[jumpToDefinition](#lsp-client.jumpToDefinition)**: [Command](#view.Command)`

Jump to the definition of the symbol at the cursor. To support cross-file jumps, you'll need to implement [`Workspace.displayFile`](#lsp-client.Workspace.displayFile).

`**[jumpToDeclaration](#lsp-client.jumpToDeclaration)**: [Command](#view.Command)`

Jump to the declaration of the symbol at the cursor.

`**[jumpToTypeDefinition](#lsp-client.jumpToTypeDefinition)**: [Command](#view.Command)`

Jump to the type definition of the symbol at the cursor.

`**[jumpToImplementation](#lsp-client.jumpToImplementation)**: [Command](#view.Command)`

Jump to the implementation of the symbol at the cursor.

`**[jumpToDefinitionKeymap](#lsp-client.jumpToDefinitionKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Binds F12 to [`jumpToDefinition`](#lsp-client.jumpToDefinition).

`**[findReferences](#lsp-client.findReferences)**: [Command](#view.Command)`

Ask the server to locate all references to the symbol at the cursor. When the server can provide such references, show them as a list in a panel.

`**[closeReferencePanel](#lsp-client.closeReferencePanel)**: [Command](#view.Command)`

Close the reference panel, if it is open.

`**[findReferencesKeymap](#lsp-client.findReferencesKeymap)**: readonly [KeyBinding](#view.KeyBinding)[]`

Binds Shift-F12 to [`findReferences`](#lsp-client.findReferences) and Escape to [`closeReferencePanel`](#lsp-client.closeReferencePanel).

## [codemirror](#codemirror)

This package depends on most of the core library packages and exports extension bundles to help set up a simple editor in a few lines of code.

`**[basicSetup](#codemirror.basicSetup)**: [Extension](#state.Extension)`

This is an extension value that just pulls together a number of extensions that you might want in a basic editor. It is meant as a convenient helper to quickly set up CodeMirror without installing and importing a lot of separate packages.

Specifically, it includes...

*   [the default keymap](#commands.defaultKeymap)
*   [line numbers](#view.lineNumbers)
*   [special character highlighting](#view.highlightSpecialChars)
*   [the undo history](#commands.history) and [history keymap](#commands.historyKeymap)
*   [a fold gutter](#language.foldGutter) and [fold keymap](#language.foldKeymap)
*   [custom selection drawing](#view.drawSelection)
*   [drop cursor](#view.dropCursor)
*   [multiple selections](#state.EditorState%5EallowMultipleSelections)
*   [reindentation on input](#language.indentOnInput)
*   [the default highlight style](#language.defaultHighlightStyle) (as fallback)
*   [bracket matching](#language.bracketMatching)
*   [bracket closing](#autocomplete.closeBrackets) and [close brackets keymap](#autocomplete.closeBracketsKeymap)
*   [autocompletion](#autocomplete.autocompletion) and [completion keymap](#autocomplete.completionKeymap)
*   [rectangular selection](#view.rectangularSelection) and [crosshair cursor](#view.crosshairCursor)
*   [active line highlighting](#view.highlightActiveLine)
*   [active line gutter highlighting](#view.highlightActiveLineGutter)
*   [selection match highlighting](#search.highlightSelectionMatches)
*   [search](#search.searchKeymap)
*   [linting](#lint.lintKeymap)

(You'll probably want to add some language package to your setup too.)

This extension does not allow customization. The idea is that, once you decide you want to configure your editor more precisely, you take this package's source (which is just a bunch of imports and an array literal), copy it into your own code, and adjust it as desired.

`**[minimalSetup](#codemirror.minimalSetup)**: [Extension](#state.Extension)`

A minimal set of extensions to create a functional editor. Only includes [the default keymap](#commands.defaultKeymap), [undo history](#commands.history) and [history keymap](#commands.historyKeymap) [special character highlighting](#view.highlightSpecialChars), [custom selection drawing](#view.drawSelection), and [default highlight style](#language.defaultHighlightStyle).

re-export `**[EditorView](#view.EditorView)**`