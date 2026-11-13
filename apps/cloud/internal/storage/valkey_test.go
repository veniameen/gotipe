package storage

import "testing"

func TestParseMemoryInfoReadsUsedAndMaxMemory(t *testing.T) {
	reply := "txt:# Memory\r\nused_memory:1048576\r\nused_memory_human:1.00M\r\nused_memory_rss:5242880\r\n" +
		"maxmemory:1073741824\r\nmaxmemory_human:1.00G\r\nmaxmemory_policy:noeviction\r\n"
	memory, err := parseMemoryInfo(reply)
	if err != nil || memory != (ValkeyMemory{Used: 1 << 20, Max: 1 << 30}) {
		t.Fatalf("got %+v %v", memory, err)
	}
	for _, broken := range []string{
		"# Memory\r\nused_memory:1048576\r\n",
		"# Memory\r\nmaxmemory:0\r\n",
		"used_memory:many\r\nmaxmemory:0\r\n",
		"used_memory:-1\r\nmaxmemory:0\r\n",
		"",
	} {
		if _, err := parseMemoryInfo(broken); err == nil {
			t.Fatalf("accepted %q", broken)
		}
	}
	if memory, err := parseMemoryInfo("used_memory:10\nmaxmemory:0\n"); err != nil || memory.Max != 0 {
		t.Fatalf("unlimited maxmemory: %+v %v", memory, err)
	}
}
