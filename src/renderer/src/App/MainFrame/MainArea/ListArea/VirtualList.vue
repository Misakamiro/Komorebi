<!-- VirtualListRecycled.vue -->
<template>
	<div ref="viewport" class="virtual-viewport" @scroll="onScroll" :style="viewportStyle">
	  <div :style="{ height: totalHeight + 'px', position: 'relative' }">
		<!-- poolSlots: fixed small number of DOM nodes we reuse -->
		<div
		  v-for="slot in poolSlots"
		  :key="slot"
		  class="virtual-item"
		  :data-slot="slot"
		  :data-index="slotIndexMap[slot] ?? -1"
		  :style="slotStyle(slot)"
		  :ref="poolRefs"
		>
		  <!-- keep a small child component to avoid remount when item changes -->
		  <PoolItem :item="items[slotIndexMap[slot]]" :index="slotIndexMap[slot]">
			<template #default="{ item, index }">
			  <slot :item="item" :index="index"></slot>
			</template>
		  </PoolItem>
		</div>
	  </div>
	</div>
  </template>
  
  <script>
  import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
  
  const PoolItem = {
	name: 'PoolItem',
	props: { item: { type: Object, default: null }, index: { type: Number, default: -1 } },
	// keep simple: a stable component that updates via prop changes (no unmount)
	template: `<div class="pool-item"><slot :item="item" :index="index"></slot></div>`
  };
  
  export default {
	name: 'VirtualListRecycled',
	components: { PoolItem },
	props: {
	  items: { type: Array, required: true },
	  itemKey: { type: [String, Function], default: 'id' },
	  estimatedItemHeight: { type: Number, default: 60 },
	  buffer: { type: Number, default: 5 },
	  viewportStyle: { type: Object, default: () => ({ height: '400px', overflow: 'auto' }) },
	  // optional maxPool to cap DOM nodes; bigger pool = fewer remaps but more DOM
	  maxPool: { type: Number, default: 30 }
	},
	emits: ['update:scrollTop'],
	setup(props, { emit, expose }) {
	  const viewport = ref(null);
	  const poolRefs = ref([]); // template ref array for pool nodes
	  const poolSlots = computed(() => {
		// pool size = min(maxPool, visibleCount + buffer*2 + 2)
		const vh = Math.max(1, viewportHeight.value || 400);
		const est = props.estimatedItemHeight || 60;
		const approxVisible = Math.ceil(vh / est);
		const desired = approxVisible + props.buffer * 2 + 2;
		return Array.from({ length: Math.min(props.maxPool, desired) }, (_, i) => i);
	  });
  
	  // mapping: slot -> index (which item index currently assigned to that DOM slot)
	  const slotIndexMap = reactive({}); // numeric keys (slot) -> index
	  const measuredHeights = reactive([]); // height cache per item index
	  const offsets = ref([]); // prefix sum offsets length = items.length + 1
	  const totalHeight = ref(0);
  
	  // internal state
	  const viewportHeight = ref(0);
	  const scrollTop = ref(0);
  
	  // ResizeObserver & batching
	  let ro = null;
	  const pendingHeightUpdates = new Map(); // index -> newHeight
	  let rafScheduled = false;
  
	  function ensureMeasuredSize(n) {
		while (measuredHeights.length < n) measuredHeights.push(undefined);
	  }
  
	  function rebuildOffsetsBatch() {
		// apply collected pendingHeightUpdates into measuredHeights
		let changed = false;
		for (const [idx, h] of pendingHeightUpdates) {
		  const prev = measuredHeights[idx];
		  if (prev !== h) {
			measuredHeights[idx] = h;
			changed = true;
		  }
		}
		pendingHeightUpdates.clear();
		if (!changed) return;
  
		// rebuild offsets
		ensureMeasuredSize(props.items.length);
		offsets.value = new Array(props.items.length + 1);
		offsets.value[0] = 0;
		for (let i = 0; i < props.items.length; i++) {
		  const h = measuredHeights[i] ?? props.estimatedItemHeight;
		  offsets.value[i + 1] = offsets.value[i] + h;
		}
		totalHeight.value = offsets.value[props.items.length] ?? 0;
		// recompute visible mapping after offset change
		computeVisibleRangeAndRemap();
		rafScheduled = false;
	  }
  
	  function scheduleRebuild() {
		if (rafScheduled) return;
		rafScheduled = true;
		requestAnimationFrame(rebuildOffsetsBatch);
	  }
  
	  function handleResize(entries) {
		for (const entry of entries) {
		  const el = entry.target;
		  const idxAttr = el.dataset.index;
		  const idx = Number(idxAttr);
		  if (Number.isNaN(idx) || idx < 0 || idx >= props.items.length) continue;
		  const h = Math.max(1, Math.round(entry.contentRect.height));
		  // only push when different to avoid thrash
		  const prevPending = pendingHeightUpdates.get(idx);
		  const cached = measuredHeights[idx];
		  if (prevPending === h || cached === h) continue;
		  pendingHeightUpdates.set(idx, h);
		}
		// batch updates in one rAF
		scheduleRebuild();
	  }
  
	  // compute visible start/end indices and remap pool slots (reuse DOM)
	  const state = reactive({ start: 0, end: -1 });
  
	  function upperBound(arr, value) {
		let low = 0, high = arr.length;
		while (low < high) {
		  const mid = (low + high) >> 1;
		  if (arr[mid] <= value) low = mid + 1;
		  else high = mid;
		}
		return low;
	  }
  
	  function computeVisibleRange() {
		ensureMeasuredSize(props.items.length);
		const st = scrollTop.value;
		const vh = viewportHeight.value || 1;
		const offs = offsets.value.length ? offsets.value : computeOffsetsWithEstimates();
		let idx = Math.max(0, upperBound(offs, st) - 1);
		// expand until fill viewport
		let visibleHeight = 0;
		let endIdx = idx;
		while (endIdx < props.items.length && visibleHeight < vh) {
		  visibleHeight += measuredHeights[endIdx] ?? props.estimatedItemHeight;
		  endIdx++;
		}
		const start = Math.max(0, idx - props.buffer);
		const end = Math.min(props.items.length - 1, endIdx + props.buffer - 1);
		state.start = start;
		state.end = end;
		return { start, end };
	  }
  
	  function computeOffsetsWithEstimates() {
		const arr = new Array(props.items.length + 1);
		arr[0] = 0;
		for (let i = 0; i < props.items.length; i++) {
		  arr[i + 1] = arr[i] + (measuredHeights[i] ?? props.estimatedItemHeight);
		}
		return arr;
	  }
  
	  // remap virtual pool slots to indexes needed for [start..end]
	  function computeVisibleRangeAndRemap() {
		const { start, end } = computeVisibleRange();
		const needed = [];
		for (let i = start; i <= end; i++) needed.push(i);
		// reuse slots circularly: map needed indices to poolSlots deterministically to avoid churn
		const slots = poolSlots.value;
		for (let i = 0; i < needed.length; i++) {
		  const slot = slots[i % slots.length];
		  slotIndexMap[slot] = needed[i];
		}
		// mark remaining slots as -1 (not used)
		for (const s of slots) {
		  if (!(s in slotIndexMap)) slotIndexMap[s] = -1;
		}
	  }
  
	  function slotStyle(slot) {
		const idx = slotIndexMap[slot];
		const top = idx >= 0 && offsets.value.length ? offsets.value[idx] : 0;
		const width = '100%';
		return { position: 'absolute', top: top + 'px', width };
	  }
  
	  // initial mapping
	  function initialMap() {
		ensureMeasuredSize(props.items.length);
		if (!offsets.value.length) {
		  offsets.value = computeOffsetsWithEstimates();
		  totalHeight.value = offsets.value[props.items.length] ?? 0;
		}
		computeVisibleRangeAndRemap();
	  }
  
	  function onScroll(e) {
		scrollTop.value = e.target.scrollTop;
		emit('update:scrollTop', scrollTop.value);
		computeVisibleRangeAndRemap();
	  }
  
	  function measureViewport() {
		if (!viewport.value) return;
		viewportHeight.value = Math.max(0, Math.round(viewport.value.clientHeight));
		computeVisibleRangeAndRemap();
	  }
  
	  onMounted(() => {
		ensureMeasuredSize(props.items.length);
		// create ResizeObserver and observe pool nodes
		ro = new ResizeObserver(handleResize);
		nextTick(() => {
		  // collect refs array (poolRefs may be an array of elements)
		  if (Array.isArray(poolRefs.value)) {
			for (const el of poolRefs.value) {
			  if (el) {
				// observe element, but it may have data-index assigned later
				ro.observe(el);
			  }
			}
		  } else if (poolRefs.value && typeof poolRefs.value === 'object') {
			// fallback: single ref
			ro.observe(poolRefs.value);
		  }
		  measureViewport();
		});
		window.addEventListener('resize', measureViewport);
		initialMap();
	  });
  
	  onBeforeUnmount(() => {
		if (ro) {
		  try { ro.disconnect(); } catch (e) {}
		  ro = null;
		}
		window.removeEventListener('resize', measureViewport);
	  });
  
	  // watch items length -> ensure cache resize & rebuild offsets
	  watch(() => props.items.length, (n) => {
		ensureMeasuredSize(n);
		offsets.value = computeOffsetsWithEstimates();
		totalHeight.value = offsets.value[props.items.length] ?? 0;
		computeVisibleRangeAndRemap();
	  });
  
	  // expose API
	  function scrollToIndex(i, align = 'start') {
		i = Math.max(0, Math.min(props.items.length - 1, i));
		const top = (offsets.value.length ? offsets.value[i] : i * props.estimatedItemHeight);
		if (!viewport.value) return;
		let target = top;
		if (align === 'center') {
		  target = top - (viewportHeight.value - (measuredHeights[i] ?? props.estimatedItemHeight)) / 2;
		} else if (align === 'end') {
		  target = top - (viewportHeight.value - (measuredHeights[i] ?? props.estimatedItemHeight));
		}
		viewport.value.scrollTop = Math.max(0, Math.round(target));
		scrollTop.value = viewport.value.scrollTop;
		computeVisibleRangeAndRemap();
	  }
  
	  expose({ scrollToIndex, measureViewport });
  
	  return {
		viewport,
		poolRefs,
		poolSlots,
		slotIndexMap,
		slotStyle,
		totalHeight,
		items: props.items,
		onScroll,
		viewportStyle: props.viewportStyle
	  };
	}
  };
  </script>
  
  <style scoped>
  .virtual-viewport { width: 100%; }
  .virtual-item { box-sizing: border-box; }
  .pool-item { width: 100%; }
  </style>
  