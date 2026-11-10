package ai

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"strings"
)

func decodeResponse(provider string, data []byte, stream bool) (string, Usage, bool, error) {
	var msg struct {
		Type    string          `json:"type"`
		Error   json.RawMessage `json:"error"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Delta struct {
				Content string `json:"content"`
			} `json:"delta"`
		} `json:"choices"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Delta struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"delta"`
		Message struct {
			Usage struct {
				Input  int `json:"input_tokens"`
				Output int `json:"output_tokens"`
			} `json:"usage"`
		} `json:"message"`
		Usage struct {
			Prompt     int `json:"prompt_tokens"`
			Completion int `json:"completion_tokens"`
			Input      int `json:"input_tokens"`
			Output     int `json:"output_tokens"`
		} `json:"usage"`
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text    string `json:"text"`
					Thought bool   `json:"thought"`
				} `json:"parts"`
			} `json:"content"`
			Finish string `json:"finishReason"`
		} `json:"candidates"`
		UsageMetadata struct {
			Prompt     int `json:"promptTokenCount"`
			Completion int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(data, &msg); err != nil {
		return "", Usage{}, false, errors.New("invalid AI provider response")
	}
	if len(msg.Error) > 0 && string(msg.Error) != "null" {
		return "", Usage{}, false, errors.New("AI provider reported an error")
	}
	text := ""
	usage := Usage{}
	done := false
	switch provider {
	case "openai":
		if len(msg.Choices) > 0 {
			if stream {
				text = msg.Choices[0].Delta.Content
			} else {
				text = msg.Choices[0].Message.Content
			}
		}
		usage = Usage{msg.Usage.Prompt, msg.Usage.Completion}
	case "anthropic":
		for _, part := range msg.Content {
			if part.Type == "text" {
				text += part.Text
			}
		}
		if msg.Delta.Type == "text_delta" {
			text += msg.Delta.Text
		}
		usage = Usage{msg.Usage.Input, msg.Usage.Output}
		if msg.Type == "message_start" {
			usage = Usage{msg.Message.Usage.Input, msg.Message.Usage.Output}
		}
		done = msg.Type == "message_stop"
	case "google":
		if len(msg.Candidates) > 0 {
			for _, part := range msg.Candidates[0].Content.Parts {
				if !part.Thought {
					text += part.Text
				}
			}
			done = msg.Candidates[0].Finish != ""
		}
		usage = Usage{msg.UsageMetadata.Prompt, msg.UsageMetadata.Completion}
	}
	return text, usage, done, nil
}

func readStream(reader io.Reader, input Request, result Result, emit func(string) error) (Result, error) {
	scanner := bufio.NewScanner(io.LimitReader(reader, 8<<20))
	scanner.Buffer(make([]byte, 4096), 1<<20)
	var data []string
	done := false
	process := func() error {
		if len(data) == 0 {
			return nil
		}
		payload := strings.Join(data, "\n")
		data = nil
		if payload == "[DONE]" {
			done = true
			return nil
		}
		text, usage, finished, err := decodeResponse(input.Provider, []byte(payload), true)
		if err != nil {
			return err
		}
		done = done || finished
		if usage.PromptTokens != 0 {
			result.Usage.PromptTokens = usage.PromptTokens
		}
		if usage.CompletionTokens != 0 {
			result.Usage.CompletionTokens = usage.CompletionTokens
		}
		if text != "" {
			result.Content += text
			if emit != nil {
				return emit(text)
			}
		}
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if err := process(); err != nil {
				return result, err
			}
		} else if strings.HasPrefix(line, "data:") {
			data = append(data, strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
		}
	}
	if err := scanner.Err(); err != nil {
		return result, err
	}
	if err := process(); err != nil {
		return result, err
	}
	if !done {
		return result, io.ErrUnexpectedEOF
	}
	if result.Content == "" {
		return result, errors.New("AI provider returned no text")
	}
	return result, nil
}
