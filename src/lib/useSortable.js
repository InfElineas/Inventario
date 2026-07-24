import { useState } from 'react'

export function useSortable(defaultKey = '', defaultDir = 'asc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir })
  const onSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  return { sort, setSort, onSort }
}

/** Ordena un array según el estado de sort y un mapa de comparadores. */
export function applySortable(arr, sort, comparators) {
  if (!sort.key || !comparators[sort.key]) return arr
  const mul = sort.dir === 'asc' ? 1 : -1
  return [...arr].sort((a, b) => mul * comparators[sort.key](a, b))
}

export const strCmp  = (fn) => (a, b) => (fn(a) ?? '').localeCompare(fn(b) ?? '')
export const numCmp  = (fn) => (a, b) => (fn(a) ?? 0) - (fn(b) ?? 0)
export const dateCmp = (fn) => (a, b) => (fn(a) ?? '').localeCompare(fn(b) ?? '')
