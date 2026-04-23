module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow addEventListener/removeEventListener in components; use dom.js utilities',
      category: 'Best Practices',
    },
  },
  create(context) {
    const filename = context.filename;
    const isComponentFile = filename.includes('/js/components/');

    return {
      CallExpression(node) {
        if (!isComponentFile) {
          return;
        }

        // Check if this is an addEventListener or removeEventListener call
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          (node.callee.property.name !== 'addEventListener' &&
            node.callee.property.name !== 'removeEventListener')
        ) {
          return;
        }

        const methodName = node.callee.property.name;
        const replacement = methodName === 'addEventListener' ? 'on()' : 'off()';

        // Check if we're inside a destroy function
        let parent = node.parent;
        while (parent) {
          if (
            parent.type === 'FunctionExpression' &&
            parent.id &&
            parent.id.name === 'destroy'
          ) {
            return; // Allow inside destroy function
          }
          if (
            parent.type === 'ArrowFunctionExpression' &&
            parent.parent &&
            parent.parent.type === 'AssignmentExpression' &&
            parent.parent.left.type === 'MemberExpression' &&
            parent.parent.left.property.type === 'Identifier' &&
            parent.parent.left.property.name === 'destroy'
          ) {
            return; // Allow in destroy = () => {...}
          }
          parent = parent.parent;
        }

        context.report({
          node,
          message: `Use '${replacement}' from 'js/utils/dom.js' instead of '${methodName}'`,
        });
      },
    };
  },
};
