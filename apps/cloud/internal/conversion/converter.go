// Package conversion runs the same Rust document exporters used by the browser.
package conversion

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"time"
)

type Converter interface {
	Convert(context.Context, string, []byte) ([]byte, error)
}
type Native struct{ Command string }

func (n Native) Convert(ctx context.Context, format string, input []byte) ([]byte, error) {
	switch format {
	case "html", "markdown", "plaintext", "json", "pdf", "docx", "project-crdt":
	default:
		return nil, errors.New("unsupported conversion format")
	}
	command := n.Command
	if command == "" {
		command = "gotipe-convert"
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	process := exec.CommandContext(ctx, command, format)
	process.Stdin = bytes.NewReader(input)
	output := &limitedBuffer{limit: 64 << 20}
	stderr := &limitedBuffer{limit: 4096}
	process.Stdout = output
	process.Stderr = stderr
	if err := process.Run(); err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("document conversion failed: %w: %s", err, stderr.String())
	}
	if output.Len() == 0 {
		return nil, errors.New("document converter produced an empty result")
	}
	return output.Bytes(), nil
}

type limitedBuffer struct {
	bytes.Buffer
	limit int
}

func (b *limitedBuffer) Write(data []byte) (int, error) {
	if len(data) > b.limit-b.Len() {
		return 0, errors.New("converter output limit exceeded")
	}
	return b.Buffer.Write(data)
}
