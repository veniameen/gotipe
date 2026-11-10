package main

import (
	"context"
	"fmt"
	"github.com/gotipe/cloud/migrations"
	"os"
	"time"
)

func runCommand(args []string) (bool, error) {
	if len(args) == 0 {
		return false, nil
	}
	if len(args) != 2 || args[0] != "migrate" || args[1] != "up" {
		return true, fmt.Errorf("usage: api [migrate up]")
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		return true, fmt.Errorf("DATABASE_URL is required for migration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	return true, migrations.Up(ctx, url)
}
