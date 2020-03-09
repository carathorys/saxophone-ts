/**
 * Information about a text node.
 *
 * @typedef TextNode
 * @type {object}
 * @prop {string} contents The text value.
 */
export type TextNode = {
  contents: string;
};
/**
 * Information about a CDATA node
 * (<![CDATA[ ... ]]>).
 *
 * @typedef CDATANode
 * @type {object}
 * @prop {string} contents The CDATA contents.
 */
export type CDATANode = {
  contents: string;
};

/**
 * Information about a comment node
 * (<!-- ... -->).
 *
 * @typedef CommentNode
 * @type {object}
 * @prop {string} contents The comment contents
 */
export type CommentNode = {
  contents: string;
};

/**
 * Information about a processing instruction node
 * (<? ... ?>).
 *
 * @typedef ProcessingInstructionNode
 * @type {object}
 * @prop {string} contents The instruction contents
 */
export type ProcessingInstructionNode = {
  contents: string;
};

/**
 * Information about an opened tag
 * (<tag attr="value">).
 *
 * @typedef TagOpenNode
 * @type {object}
 * @prop {string} name Name of the tag that was opened.
 * @prop {string} attrs Attributes passed to the tag, in a string representation
 * (use Saxophone.parseAttributes to get an attribute-value mapping).
 * @prop {boolean} isSelfClosing Whether the tag self-closes (tags of the form
 * `<tag />`). Such tags will not be followed by a closing tag.
 */
export type TagOpenNode = {
  name: string;
  attrs: string;
  isSelfClosing: boolean;
};

/**
 * Information about a closed tag
 * (</tag>).
 *
 * @typedef TagCloseNode
 * @type {object}
 * @prop {string} name The tag name
 */
export type TagCloseNode = {
  name: string;
};

/**
 * Nodes that can be found inside an XML stream.
 * @private
 */
export type NodeType =
  | TagOpenNode
  | TagCloseNode
  | CommentNode
  | CDATANode
  | ProcessingInstructionNode;

