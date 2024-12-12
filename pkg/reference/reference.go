package reference

import "sync"

type Reference[T any] struct {
	mutex   sync.RWMutex
	store   map[uint32]T
	counter uint32
}

func (r *Reference[T]) Set(item T) uint32 {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	if r.store == nil {
		r.store = make(map[uint32]T)
	}
	r.counter++
	r.store[r.counter] = item
	return r.counter
}

func (r *Reference[T]) Get(key uint32) T {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	return r.store[key]
}

func (r *Reference[T]) Remove(key uint32) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	delete(r.store, key)
}

func (r *Reference[T]) Count() int {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	return len(r.store)
}
