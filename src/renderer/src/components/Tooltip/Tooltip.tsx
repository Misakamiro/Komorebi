import { AppContext, createVNode, VNode, render, StyleValue } from 'vue';
import TooltipUI from './TooltipComponent.vue';

export interface TooltipOptions {
	content: string | VNode,
	style: StyleValue,
	class?: string,
}

const defaultProps = {
	content: '',
	style: {},
	show: false,
};

const vnode = createVNode(TooltipUI, defaultProps);
let container: HTMLDivElement;
if (typeof document !== 'undefined') {
	container = document.createElement('div');
	document.body.appendChild(container);
	// vnode.appContext = appContext;
	render(vnode, container);
}

const Tooltip = function () {
	return vnode;
};

Tooltip.show = function (options: TooltipOptions) {
	vnode.component.props.content = options.content;
	vnode.component.props.style = options.style;
	vnode.component.props.class = options.class;
	vnode.component.props.show = true;
}

Tooltip.hide = function () {
	vnode.component.props.show = false;
}

export default Tooltip;
