export function getListOfId(ancestors, idList) {
    let ancestorIdx = ancestors.length - 2; // Last element is the node itself so we start with the one before it
    const memberExpHandler = function (node) {
        let temp = node.object;
        if (node.property.type === 'Identifier') {
            idList.unshift(node.property.name);
        }
        if (temp.type === 'MemberExpression') {
            memberExpHandler(temp);
        }
        else if (temp.type === 'Identifier') {
            idList.unshift(temp.name);
        }
    };
    while (ancestorIdx >= 0) {
        const ancestor = ancestors[ancestorIdx--];
        // console.log('ancestor', ancestor)
        switch (ancestor.type) {
            case 'FunctionExpression':
                if (ancestor.id && ancestor.id.type === 'Identifier') {
                    idList.unshift(ancestor.id.name);
                }
                break;
            case 'AssignmentExpression':
                if (ancestor.left.type === 'MemberExpression') {
                    memberExpHandler(ancestor.left);
                }
                else if (ancestor.left.type === 'Identifier') {
                    idList.unshift(ancestor.left.name);
                }
                break;
            case 'FunctionDeclaration':
            case 'ArrowFunctionExpression':
            case 'Program':
                return idList;
            case 'CallExpression':
                if (ancestor.callee.type === 'Identifier') {
                    idList.unshift(ancestor.callee.name);
                }
                else if (ancestor.callee.type === 'MemberExpression') {
                    let callee = ancestor.callee;
                    do {
                        if (callee.property.type === 'Identifier') {
                            idList.unshift(callee.property.name);
                        }
                        if (callee.object.type === 'CallExpression') {
                            callee = callee.object.callee;
                            if (callee.type === 'Identifier') {
                                idList.unshift(callee.name);
                                break;
                            }
                        }
                        else if (callee.object.type === 'MemberExpression') {
                            memberExpHandler(callee.object);
                            break;
                        }
                        else if (callee.object.type === 'Identifier') {
                            idList.unshift(callee.object.name);
                            break;
                        }
                        else {
                            break;
                        }
                    } while (callee.object); //&& callee.object.type !== "Identifier"
                }
                break;
            case 'Property':
                if (ancestor.key.type === 'Identifier') {
                    idList.unshift(ancestor.key.name);
                }
                break;
            case 'ClassProperty':
                if (ancestor.key.type === 'Identifier') {
                    idList.unshift(ancestor.key.name);
                }
                break;
            case 'VariableDeclarator':
                if (ancestor.id.type === 'Identifier') {
                    idList.unshift(ancestor.id.name);
                }
                break;
            case 'ReturnStatement':
                idList.unshift('ReturnStatement');
                break;
            case 'NewExpression':
                idList.unshift('NewExpression');
                break;
            default:
                break;
        }
    }
    return idList;
}
