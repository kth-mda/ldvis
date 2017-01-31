# LDVis reference manual

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Mapping Language Reference](#mapping-language-reference)
  - [Mapto language](#mapto-language)
    - [Node functions](#node-functions)
    - [Line functions](#line-functions)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Mapping Language Reference

The specification consists of one or more:

```
server
	<server URL>
query
	<sparql select query>
mapto
	<mapto language program>
end
```

With multiple mappings, they are executed sequentially, producing nodes and lines into the same set. So id uniqueness applies for the total set of nodes and lines. If the same node is configured multiple times, the last one will override all before.

### Mapto language

This is a JavaScript program, that has a small predefined set of objects, functions and variables.

|variable|type|description|
|---|---|---|
|node(id)|function|Creates a node with the specified id, that becomes the label if no other label is specieid. Id must be a string.|
|line(sourceId, relationId, targetId)|function|Creates a line between node sourceId and node targetId. RelationId identifies the line, and is important when there are more than one line between a pair of nodes. With different relationId they are created separately.|
|i|variable|The query result row number, starting with 0.|
|console|object|An object that can be used for debug logging. Use console.log('i', i); to log 0, 1, 2 etc to the browser javascript console. It can be used for debugging the program.|
|params|variable|An object containing the URL parameters and values. Use params.p to get the value of URL parameter p.

The node and line functions below, sets some attribute and then returns the node or line. This make it possible to chain multiple function calls together.

node(?s).label(?title).color('blue');

Or if you want, set a variable to do the calls in steps.

var node1 = node(?s);
node1.label(?title).color('blue');


#### Node functions

|name|description|
|---|---|
|label(s)|Uses the s as label for the node. The node keeps is id internally, to make it unique. The label doesn't have to be unique among the nodes.|
|parent(id)|Renders the current node inside the node with the specified id. The parent node has to be created for this to work.|
| color(c)|Set the background color of the node to the specified color. The color is a string naming the color ('red', 'blue', 'lightgreen' etc) or a numeric expression like '#f56', '#e4bc10' or 'RGB(123, 234, 223)'.|
|borderColor(c)|Sets the color of the border of the node. Same coding as for color.|
|cornerRadius(r)|Sets the radius in pixels of the node rectangle corners.|
|layout(l)|Sets the layout algorithm for child nodes of this node. l can be 'vbox' (default), 'hbox' or 'xy'. Where 'vbox' is vertical downwards, 'hbox' is horisontal rightwards and 'xy' is absolutely positioned and manually movable by dragging.|
|click(href, target)|Navigates to href on node click. If target is omitted, then the diagram page is replaced by the href page. If target is specified, then the href page is displayed in an other browser tab. If target is '_blank' or '_new' a new tab is opened for each navigation. If any other string is used, then a new tab is opened with that id. If the same target is used on a subsequent navigation, then the tab with that id is re-used. See documentation for HTML A element, for more information about navigation targets.|

#### Line functions

|name|description|
|---|---|
|label(s)|Uses the s as label for the line. The line keeps is relationId internally, to make it unique. The label doesn't have to be unique among the lines.|
