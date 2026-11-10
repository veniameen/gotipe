package sync

import (
	"errors"
	"time"
)

type messageWindow struct {
	times  []time.Time
	window time.Duration
	next   int
	count  int
}

func newMessageWindow(limit int, window time.Duration) *messageWindow {
	return &messageWindow{times: make([]time.Time, limit), window: window}
}

// allow is called only by a connection's read pump. The fixed ring bounds memory
// and enforces the exact configured sliding window, including empty/text frames.
func (w *messageWindow) allow(now time.Time) bool {
	if w.count == len(w.times) && now.Sub(w.times[w.next]) < w.window {
		return false
	}
	w.times[w.next] = now
	w.next = (w.next + 1) % len(w.times)
	if w.count < len(w.times) {
		w.count++
	}
	return true
}

func (s *Server) SetMessageRate(limit int, window time.Duration) error {
	if limit < 1 || limit > 100000 || window < time.Millisecond {
		return errors.New("sync message rate requires 1..100000 messages and a positive window")
	}
	s.mu.Lock()
	s.messageLimit = limit
	s.messageWindow = window
	s.mu.Unlock()
	return nil
}
