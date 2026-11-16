import { Icon } from "../../site/icon";

/**
 * The small live pictures of the bento (Atlas frame 20). Each repeats what its tile says in the
 * library's own terms: one transaction of three steps, a Markdown file written back unchanged,
 * two people in one paragraph. They play once when the tile comes into view (motion.css) and are
 * decoration: the tile's text says the same.
 */

/** «An engine. Not a wrapper.»: a transaction, its steps, the same contract in both engines. */
export function TransactionMock() {
  return (
    <div className="site-mock site-tx" aria-hidden="true">
      <p className="site-mock-head">
        <span>transaction</span>
        <span className="site-kbd">⌘Z</span>
      </p>
      <ol className="site-tx-steps">
        <li>
          <code>insertText</code>
          <span>“Launch notes”</span>
          <Icon name="check-16" />
        </li>
        <li>
          <code>addMark</code>
          <span>bold</span>
          <Icon name="check-16" />
        </li>
        <li>
          <code>setBlockType</code>
          <span>heading</span>
          <Icon name="check-16" />
        </li>
      </ol>
      <p className="site-tx-engines">
        <span>TypeScript</span>
        <span className="site-tx-link" />
        <span>Rust/WASM</span>
      </p>
      <p className="site-mock-note">one step · one undo · one contract</p>
    </div>
  );
}

/** «Your Markdown stays yours.»: the file's lines checked one by one, nothing rewritten. */
export function MarkdownMock() {
  return (
    <div className="site-mock site-md" aria-hidden="true">
      <p className="is-head"># Offline drafts</p>
      <p>Drafts write first, sync later.</p>
      <p>- [x] keep my spacing</p>
      <p className="site-md-foot">
        <span>written back</span>
        <span className="is-ok">
          <Icon name="check-16" />0 lines changed
        </span>
      </p>
    </div>
  );
}

/** «Better, together.»: Jonas selects while Mira types in the same paragraph. */
export function PairMock() {
  return (
    <div className="site-mock site-pair" aria-hidden="true">
      <p className="site-pair-text">
        Two people,
        <span className="site-pair-caret is-mira">
          <span className="site-pair-flag">Mira</span>
        </span>
        <br />
        <span className="site-pair-selection">one paragraph.</span>
        <span className="site-pair-caret is-jonas">
          <span className="site-pair-flag">Jonas</span>
        </span>
      </p>
      <p className="site-pair-note">two&nbsp;edits&nbsp;· one&nbsp;merge&nbsp;· no&nbsp;conflict</p>
    </div>
  );
}
