import * as utils from './utils';
import * as d3 from './d3';

// on hover, make tooltip object visible and position near node owning the tooltip
export function TooltipTool(options) {
  var
    dispatch = d3.dispatch('move', 'end'),
    dragEls, ghostRects, ghostBounds, grabOffset;

  var tool = {
    onOver: (m) => {d3.event.target.style.cursor = "help"; return true;},
    on: (type, listener) => {dispatch.on(type, listener); return tool;}
  };
  return tool;
};
