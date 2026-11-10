package sync

import (
	"encoding/json"
	"errors"
)

// The public JS API and WASM use different field names but the same document.
// Normalize only that boundary representation before comparing baseline identity.
func normalizedDocument(data []byte) ([]byte, error) {
	var document map[string]any
	if err := json.Unmarshal(data, &document); err != nil {
		return nil, err
	}
	blocks, ok := document["blocks"].([]any)
	if !ok {
		return nil, errors.New("document must contain a blocks array")
	}
	ids := make(map[string]bool)
	normalized := make([]any, 0, len(blocks))
	for _, value := range blocks {
		block, err := normalizeBlock(value, 0, ids)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, block)
	}
	return json.Marshal(map[string]any{"version": 0, "blocks": normalized})
}
func normalizeBlock(value any, depth int, ids map[string]bool) (map[string]any, error) {
	if depth > 128 {
		return nil, errors.New("document nesting limit exceeded")
	}
	block, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("block must be an object")
	}
	id, ok := block["id"].(string)
	if !ok || id == "" || ids[id] {
		return nil, errors.New("block ID is missing or duplicated")
	}
	ids[id] = true
	kind, _ := block["block_type"].(string)
	if kind == "" {
		kind, _ = block["type"].(string)
	}
	if kind == "" {
		return nil, errors.New("block type is missing")
	}
	attrs, err := normalizeAttrs(block["attrs"])
	if err != nil {
		return nil, err
	}
	content, err := normalizeContent(block["content"])
	if err != nil {
		return nil, err
	}
	children := []any{}
	if value, exists := block["children"]; exists && value != nil {
		raw, ok := value.([]any)
		if !ok {
			return nil, errors.New("children must be an array")
		}
		for _, child := range raw {
			normalized, err := normalizeBlock(child, depth+1, ids)
			if err != nil {
				return nil, err
			}
			children = append(children, normalized)
		}
	}
	return map[string]any{"id": id, "block_type": kind, "attrs": attrs, "content": content, "children": children}, nil
}
func normalizeAttrs(value any) (map[string]any, error) {
	if value == nil {
		return map[string]any{}, nil
	}
	attrs, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("attributes must be an object")
	}
	for _, value := range attrs {
		if !validJSONAttr(value, 0) {
			return nil, errors.New("attribute values must be JSON data with depth at most 64")
		}
	}
	return attrs, nil
}
func normalizeContent(value any) (map[string]any, error) {
	switch content := value.(type) {
	case nil:
		return map[string]any{"type": "Empty"}, nil
	case string:
		return map[string]any{"type": "Raw", "value": content}, nil
	case []any:
		spans := make([]any, 0, len(content))
		for _, value := range content {
			span, ok := value.(map[string]any)
			if !ok {
				return nil, errors.New("span must be an object")
			}
			text, ok := span["text"].(string)
			if !ok {
				return nil, errors.New("span text must be a string")
			}
			marks := []any{}
			if value, exists := span["marks"]; exists && value != nil {
				raw, ok := value.([]any)
				if !ok {
					return nil, errors.New("marks must be an array")
				}
				for _, value := range raw {
					mark, ok := value.(map[string]any)
					if !ok {
						return nil, errors.New("mark must be an object")
					}
					kind, _ := mark["mark_type"].(string)
					if kind == "" {
						kind, _ = mark["type"].(string)
					}
					if kind == "" {
						return nil, errors.New("mark type is missing")
					}
					attrs, err := normalizeAttrs(mark["attrs"])
					if err != nil {
						return nil, err
					}
					marks = append(marks, map[string]any{"mark_type": kind, "attrs": attrs})
				}
			}
			spans = append(spans, map[string]any{"text": text, "marks": marks})
		}
		return map[string]any{"type": "RichText", "value": spans}, nil
	case map[string]any:
		switch content["type"] {
		case "Empty":
			return map[string]any{"type": "Empty"}, nil
		case "Raw":
			if text, ok := content["value"].(string); ok {
				return map[string]any{"type": "Raw", "value": text}, nil
			}
		case "RichText":
			if spans, ok := content["value"].([]any); ok {
				return normalizeContent(spans)
			}
		}
	}
	return nil, errors.New("invalid block content")
}
