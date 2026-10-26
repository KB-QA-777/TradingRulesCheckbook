// Trading Rules Checkbook launcher for Windows.
//
// Opens the checkbook in its own app window (Chrome or Edge), or in the
// default browser if neither is installed. When the exe sits next to
// index.html (inside the cloned repo) it opens that copy; otherwise it
// unpacks its built-in copy to %LOCALAPPDATA%\TradingRulesCheckbook\app.
package main

import (
	"embed"
	"io/fs"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed app
var bundled embed.FS

func main() {
	page := findPage()
	if page == "" {
		return
	}
	link := (&url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(page)}).String()

	for _, browser := range browsers() {
		if _, err := os.Stat(browser); err == nil {
			if exec.Command(browser, "--app="+link).Start() == nil {
				return
			}
		}
	}
	exec.Command("rundll32", "url.dll,FileProtocolHandler", page).Start()
}

// findPage returns the index.html to open: the one beside the exe if present,
// otherwise the bundled copy, refreshed on every launch so it matches the exe.
func findPage() string {
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		if exists(filepath.Join(dir, "index.html")) && exists(filepath.Join(dir, "app.js")) {
			return filepath.Join(dir, "index.html")
		}
	}

	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	dest := filepath.Join(base, "TradingRulesCheckbook", "app")
	err := fs.WalkDir(bundled, "app", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		data, err := bundled.ReadFile(path)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel("app", filepath.FromSlash(path))
		target := filepath.Join(dest, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	})
	if err != nil {
		return ""
	}
	return filepath.Join(dest, "index.html")
}

// browsers lists Chrome and Edge install locations, Chrome first to match Start-Windows.bat.
func browsers() []string {
	pf, pf86, local := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
	return []string{
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(local, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
	}
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
