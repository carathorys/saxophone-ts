import {
  NodeType,
  TextNode,
  CDATANode,
  CommentNode,
  TagOpenNode,
  TagCloseNode,
  ProcessingInstructionNode
} from './nodes';

/**
 * Emitted whenever a closing tag node is encountered.
 *
 * @event Saxophone#tagclose
 * @type {TagCloseNode}
 */
export type EventType =
  | 'text'
  | 'cdata'
  | 'comment'
  | 'markupDeclaration'
  | 'processingInstruction'
  | 'tagOpen'
  | 'tagClose'
  | 'finish';

export type EventTypeMap<E extends EventType> = E extends 'text'
  ? TextNode
  : E extends 'cdata'
  ? CDATANode
  : E extends 'comment'
  ? CommentNode
  : E extends 'processingInstruction'
  ? ProcessingInstructionNode
  : E extends 'tagOpen'
  ? TagOpenNode
  : E extends 'tagClose'
  ? TagCloseNode
  : never;

export type EventListenerFunctions<E extends EventType, N extends EventTypeMap<E>> =
  | ((node: N, ...args: any[]) => Promise<void>)
  | ((node: N, ...args: any[]) => void);

export type EventListeners<E extends EventType, N extends EventTypeMap<E>> = {
  [name in E]?: EventListenerFunctions<E, N>[];
};
