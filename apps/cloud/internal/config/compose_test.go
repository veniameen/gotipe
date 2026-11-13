package config

import (
	"errors"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

const composeFile = "../../../../infra/docker-compose.yml"

func composeValue(t *testing.T, compose, pattern string) string {
	t.Helper()
	matches := regexp.MustCompile(pattern).FindAllStringSubmatch(compose, -1)
	if len(matches) != 1 {
		t.Fatalf("%s: want one match in docker-compose.yml, got %d", pattern, len(matches))
	}
	return matches[0][1]
}

// TRUSTED_PROXIES must name exactly Caddy's fixed address, which must stay out of
// the range Docker hands to other containers.
func TestComposeTrustsOnlyCaddysFixedAddress(t *testing.T) {
	data, err := os.ReadFile(composeFile)
	if err != nil {
		t.Fatal(err)
	}
	compose := string(data)
	caddy, err := netip.ParseAddr(composeValue(t, compose, `ipv4_address: (\S+)`))
	if err != nil {
		t.Fatal(err)
	}
	subnet, err := netip.ParsePrefix(composeValue(t, compose, `subnet: (\S+)`))
	if err != nil {
		t.Fatal(err)
	}
	dynamic, err := netip.ParsePrefix(composeValue(t, compose, `ip_range: (\S+)`))
	if err != nil {
		t.Fatal(err)
	}
	trusted, err := parseTrustedProxies(splitValues(composeValue(t, compose, `TRUSTED_PROXIES: "([^"]*)"`)))
	if err != nil || len(trusted) != 1 || trusted[0] != netip.PrefixFrom(caddy, 32) {
		t.Fatalf("TRUSTED_PROXIES %v does not name Caddy's %s: %v", trusted, caddy, err)
	}
	if !subnet.Contains(caddy) || caddy == subnet.Addr().Next() || dynamic.Contains(caddy) || !subnet.Contains(dynamic.Addr()) || dynamic.Bits() < subnet.Bits() {
		t.Fatalf("Caddy %s must be in %s, not the gateway, and outside the dynamic range %s", caddy, subnet, dynamic)
	}
}

// fakeDocker answers the docker calls deploy.sh makes and records them.
const fakeDocker = `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  *"config --format json"*)
    printf '{\n  "name": "infra",\n  "networks": {\n    "backend": {\n      "name": "infra_backend",\n'
    printf '      "ipam": {\n        "config": [\n          {\n            "subnet": "%s",\n' "$FAKE_EXPECTED_SUBNET"
    printf '            "ip_range": "unused"\n          }\n        ]\n      }\n    }\n  }\n}\n' ;;
  "network ls"*) if [ -n "$FAKE_NETWORK" ]; then printf '%s\n' "$FAKE_NETWORK"; fi ;;
  "network inspect"*) for subnet in $FAKE_SUBNETS; do printf '%s ' "$subnet"; done ;;
esac
exit 0
`

func TestDeployStopsWhenTheBackendNetworkPredatesTheFixedSubnet(t *testing.T) {
	data, err := os.ReadFile(composeFile)
	if err != nil {
		t.Fatal(err)
	}
	expected := composeValue(t, string(data), `subnet: (\S+)`)
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(fakeDocker), 0o755); err != nil {
		t.Fatal(err)
	}
	script, err := filepath.Abs("../../../../infra/scripts/deploy.sh")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, network, subnets string
		code                   int
	}{
		{"network from before the fixed subnet", "3f2a9c", "172.18.0.0/16", 3},
		{"network with the fixed subnet", "3f2a9c", expected, 0},
		{"first deployment", "", "", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := filepath.Join(t.TempDir(), "docker.log")
			command := exec.Command("bash", script, "v1.2.3")
			command.Env = append(os.Environ(), "PATH="+bin+string(os.PathListSeparator)+os.Getenv("PATH"),
				"FAKE_DOCKER_LOG="+log, "FAKE_EXPECTED_SUBNET="+expected, "FAKE_NETWORK="+tc.network, "FAKE_SUBNETS="+tc.subnets)
			output, err := command.CombinedOutput()
			code := 0
			var exit *exec.ExitError
			if errors.As(err, &exit) {
				code = exit.ExitCode()
			} else if err != nil {
				t.Fatal(err)
			}
			calls, _ := os.ReadFile(log)
			deployed := strings.Contains(string(calls), "pull api") && strings.Contains(string(calls), "up -d --no-deps")
			if code != tc.code || deployed != (tc.code == 0) {
				t.Fatalf("exit %d, deployed %v\noutput:\n%s\ncalls:\n%s", code, deployed, output, calls)
			}
			if tc.code != 0 && (!strings.Contains(string(output), "has subnet 172.18.0.0/16 but docker-compose.yml expects "+expected) || !strings.Contains(string(output), "--profile monitoring down")) {
				t.Fatalf("unclear message:\n%s", output)
			}
		})
	}
}
