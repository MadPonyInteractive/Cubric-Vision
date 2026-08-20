/**
 * mpi/no-bare-form-control — every UI element is a component (MPI-582).
 *
 * A bare `<input>`, `<select>`, `<textarea>` or `<button>` outside a Primitive is
 * a control the app already owns, drawn a second way. That is not theoretical:
 * `js/utils/declaredFields.js` hand-rolled five of its seven declared field types,
 * so a declared slider rendered Chromium's NATIVE range widget — wrong rail, wrong
 * thumb, an `accent-color` tint matching nothing — in every Flow and in the History
 * upscale panel, and the app carried four independent drawings of one slider.
 *
 * The prose rule already existed (`.claude/rules/components.md`) and was ignored
 * five times, which is why this is a check.
 *
 * Primitives are exempt by path: `js/components/Primitives/` is exactly where the
 * real control is allowed to live, because that is what a Primitive IS.
 */

const OWNED = {
    input: 'MpiInput (text/number), MpiCheckbox (checkbox), or MpiProgressBar (range)',
    select: 'MpiDropdown',
    textarea: 'MpiInput with type: "textarea"',
    button: 'MpiButton',
};

const TAGS = Object.keys(OWNED);

// `<input`, `<select`… followed by a non-ident char, so `<selection-thing>` and a
// prose mention like "<inputs>" do not trip it.
const MARKUP = new RegExp(`<(${TAGS.join('|')})(?![a-zA-Z0-9-])`);

const advise = (tag) => `Bare <${tag}> — every UI element is a component. Use ${OWNED[tag]}, or create a new Primitive if none fits (.claude/rules/components.md § Every UI element is a component)`;

module.exports = {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow bare form controls outside Primitives; mount the app component',
            category: 'Best Practices',
        },
    },
    create(context) {
        const filename = (context.filename || context.getFilename() || '').replace(/\\/g, '/');
        // A Primitive is where the real control belongs. Nothing else is exempt —
        // a Compound or Organism reaching for a raw control is the defect.
        if (filename.includes('js/components/Primitives/')) return {};

        /** The tag name when this is a call that CREATES one of the owned elements. */
        const createdTag = (node) => {
            const c = node.callee;
            const isCe = c.type === 'Identifier' && c.name === 'ce';
            const isCreateElement = c.type === 'MemberExpression'
                && c.property.type === 'Identifier'
                && c.property.name === 'createElement';
            if (!isCe && !isCreateElement) return null;
            const arg = node.arguments[0];
            if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return null;
            const tag = arg.value.toLowerCase();
            return TAGS.includes(tag) ? tag : null;
        };

        const reportMarkup = (node, raw) => {
            const m = MARKUP.exec(raw);
            if (m) context.report({ node, message: advise(m[1]) });
        };

        return {
            CallExpression(node) {
                const tag = createdTag(node);
                if (tag) context.report({ node, message: advise(tag) });
            },
            // Templates are the other half: a Compound's `template:` string builds the
            // same bare control in markup rather than in JS.
            Literal(node) {
                if (typeof node.value === 'string') reportMarkup(node, node.value);
            },
            TemplateLiteral(node) {
                for (const q of node.quasis) reportMarkup(node, q.value.raw);
            },
        };
    },
};
