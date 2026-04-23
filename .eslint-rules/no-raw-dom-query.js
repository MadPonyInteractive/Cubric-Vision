module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow raw DOM query methods; use dom.js utilities instead',
      category: 'Best Practices',
    },
  },
  create(context) {
    const FORBIDDEN_METHODS = new Set([
      'querySelector',
      'querySelectorAll',
      'getElementById',
    ]);

    return {
      CallExpression(node) {
        // Check if callee is a MemberExpression
        if (node.callee.type !== 'MemberExpression') {
          return;
        }

        const { property } = node.callee;
        if (property.type !== 'Identifier') {
          return;
        }

        // Check for document.querySelector, el.querySelector, etc.
        if (FORBIDDEN_METHODS.has(property.name)) {
          context.report({
            node,
            message: `Use 'qs', 'qsa', or 'gid' from 'js/utils/dom.js' instead of '${property.name}'`,
          });
        }
      },
    };
  },
};
