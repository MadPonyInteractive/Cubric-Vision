module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow raw console methods in components/shell; use clientLogger',
      category: 'Best Practices',
    },
  },
  create(context) {
    const filename = context.filename;
    const isRestrictedFile =
      filename.includes('/js/components/') || filename.includes('/js/shell/');

    if (!isRestrictedFile) {
      return {};
    }

    const FORBIDDEN_METHODS = new Set(['log', 'warn', 'error', 'debug']);

    return {
      CallExpression(node) {
        // Check if callee is console.X
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.object.type !== 'Identifier' ||
          node.callee.object.name !== 'console'
        ) {
          return;
        }

        const { property } = node.callee;
        if (property.type !== 'Identifier') {
          return;
        }

        if (FORBIDDEN_METHODS.has(property.name)) {
          context.report({
            node,
            message: `Use 'clientLogger' from 'js/services/clientLogger.js' instead of 'console.${property.name}'`,
          });
        }
      },
    };
  },
};
