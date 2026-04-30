// directives/intersect.ts
import { Directive } from 'vue'

type Value = { onChange?: (entry: IntersectionObserverEntry, customProps: any) => void, options?: IntersectionObserverInit }

let observer: IntersectionObserver | null = null
const observed = new WeakMap<Element, Value>()

function ensureObserver(root: Element | null = null, options?: IntersectionObserverInit) {
  if (observer) return observer
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const val = observed.get(entry.target)
      if (val?.onChange) val.onChange(entry, (entry.target as any).dataset)
    }
  }, options)
  return observer
}

export const intersect: Directive<Element, Value> = {
  mounted(el, binding) {
    const val: Value = binding.value ?? {}
    observed.set(el, val)
    const obs = ensureObserver(null, val.options)
    obs.observe(el)
  },
//   updated(el, binding) {
//     // 当指令绑定的 value 改变时，更新存储的回调/id
//     const val: Value = binding.value ?? {}
//     observed.set(el, val)
//     // 如果你需要更改 observer 的 options，通常需要重新创建 observer —— 这里不自动处理
//   },
  unmounted(el) {
    observed.delete(el)
    if (observer) observer.unobserve(el)
  }
}
