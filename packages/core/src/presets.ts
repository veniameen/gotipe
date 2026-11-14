import { DragAndDrop, History, Placeholder, SlashCommands } from "./extensions/behaviors";
import { Blockquote } from "./extensions/blockquote";
import { BulletList, ListItem, TodoList } from "./extensions/bullet-list";
import { Callout } from "./extensions/callout";
import { CodeBlock } from "./extensions/code-block";
import { Columns } from "./extensions/columns";
import { Divider } from "./extensions/divider";
import { Embed } from "./extensions/embed";
import { File } from "./extensions/file";
import { Heading } from "./extensions/heading";
import { Image } from "./extensions/image";
import {
  Bold,
  Highlight,
  InlineCode,
  Italic,
  Link,
  Strikethrough,
  Subscript,
  Superscript,
  TextColor,
  Underline,
} from "./extensions/marks";
import { Math } from "./extensions/math";
import { OrderedList } from "./extensions/ordered-list";
import { Paragraph } from "./extensions/paragraph";
import { Table } from "./extensions/table";
import { Toggle } from "./extensions/toggle";

export const MinimalPreset = [Paragraph, Bold, Italic, History];

/** The Default extensions; each preset lists an extension once, with its heading levels. */
const standard = (heading: typeof Heading) => [
  Paragraph,
  heading,
  BulletList,
  OrderedList,
  ListItem,
  TodoList,
  CodeBlock,
  Image,
  Blockquote,
  Callout,
  Divider,
  Table,
  Toggle,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  InlineCode,
  Link,
  Highlight,
  TextColor,
  History,
  Placeholder,
  DragAndDrop,
  SlashCommands,
];

export const DefaultPreset = standard(Heading.configure({ levels: [1, 2, 3] }));

export const FullPreset = [
  ...standard(Heading.configure({ levels: [1, 2, 3, 4, 5, 6] })),
  Columns,
  Embed,
  Math,
  File,
  Superscript,
  Subscript,
];
