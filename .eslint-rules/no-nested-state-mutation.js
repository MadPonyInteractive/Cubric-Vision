module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow nested state mutations; use top-level Proxy pattern',
      category: 'Best Practices',
    },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        const { left } = node;

        // Check for pattern: state.X.Y = Z or state.X[i] = Z
        if (left.type === 'MemberExpression') {
          const obj = left.object;
          if (
            obj.type === 'MemberExpression' &&
            obj.object.type === 'Identifier' &&
            obj.object.name === 'state'
          ) {
            context.report({
              node,
              message:
                "Don't mutate nested state properties. Replace top-level key: state.X = { ...state.X, ... }",
            });
          }
        }
      },

      CallExpression(node) {
        // Check for state.X.push(...) or state.X.splice(...)
        if (node.callee.type !== 'MemberExpression') {
          return;
        }

        const { property } = node.callee;
        if (property.type !== 'Identifier') {
          return;
        }

        if (property.name !== 'push' && property.name !== 'splice') {
          return;
        }

        const obj = node.callee.object;
        if (
          obj.type === 'MemberExpression' &&
          obj.object.type === 'Identifier' &&
          obj.object.name === 'state'
        ) {
          context.report({
            node,
            message: `Don't call '${property.name}' on nested state. Replace top-level key: state.X = { ...state.X, ... }`,
          });
        }
      },
    };
  },
};
