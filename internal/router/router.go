package router

import (
	"encoding/json"
	"net/http"

	"github.com/Nguyenphuc0312/hacom-cloud-service/internal/health"
)

const homePage = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hacom Cloud API</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f6fa; color: #172033; }
    main { width: min(680px, calc(100% - 40px)); padding: 32px; border-radius: 18px; background: white; box-shadow: 0 16px 50px #23314d1a; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #667085; }
    #status { display: inline-flex; align-items: center; gap: 8px; margin: 12px 0 22px; padding: 8px 12px; border-radius: 999px; background: #eef2f6; font-weight: 700; }
    #status.up { color: #067647; background: #ecfdf3; }
    #status.down { color: #b42318; background: #fef3f2; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
    nav { display: grid; gap: 10px; }
    a { padding: 13px 15px; border: 1px solid #d8dee8; border-radius: 10px; color: #175cd3; text-decoration: none; }
    a:hover { background: #f8fafc; }
    code { color: #475467; }
    @media (prefers-color-scheme: dark) {
      body { background: #101828; color: #f2f4f7; }
      main { background: #1d2939; }
      p, code { color: #98a2b3; }
      a { border-color: #344054; color: #84adff; }
      a:hover { background: #344054; }
    }
  </style>
</head>
<body>
  <main>
    <h1>Hacom Cloud API</h1>
    <p>Go API và Health Check đang chạy tại <code>localhost:8080</code>.</p>
    <div id="status"><span class="dot"></span><span>Đang kiểm tra...</span></div>
    <nav>
      <a href="/health">Health Check — PostgreSQL và MinIO</a>
      <a href="/health/ready">Readiness Check</a>
      <a href="/health/live">Liveness Check</a>
    </nav>
  </main>
  <script>
    fetch("/health").then(async response => {
      const element = document.querySelector("#status");
      element.className = response.ok ? "up" : "down";
      element.lastElementChild.textContent = response.ok ? "Hệ thống đang hoạt động" : "Dependency chưa sẵn sàng";
    }).catch(() => {
      const element = document.querySelector("#status");
      element.className = "down";
      element.lastElementChild.textContent = "Không thể kiểm tra trạng thái";
    });
  </script>
</body>
</html>`

func New(healthService *health.Service, cloudHandlers ...http.Handler) http.Handler {
	mux := http.NewServeMux()
	healthHandler := health.NewHandler(healthService)

	mux.HandleFunc("/", home)
	mux.HandleFunc("/health", healthHandler.Readiness)
	mux.HandleFunc("/health/ready", healthHandler.Readiness)
	mux.HandleFunc("/health/live", healthHandler.Liveness)
	if len(cloudHandlers) > 0 && cloudHandlers[0] != nil {
		mux.Handle(
			"/api/v1/cloud/",
			http.StripPrefix("/api/v1/cloud", cloudHandlers[0]),
		)
	}
	if len(cloudHandlers) > 1 && cloudHandlers[1] != nil {
		mux.Handle(
			"/internal/v1/cloud/",
			http.StripPrefix("/internal/v1/cloud", cloudHandlers[1]),
		)
	}
	if len(cloudHandlers) > 2 && cloudHandlers[2] != nil {
		mux.Handle("/metrics", cloudHandlers[2])
	}
	if len(cloudHandlers) > 3 && cloudHandlers[3] != nil {
		mux.Handle(
			"/api/v1/admin/cloud/",
			http.StripPrefix("/api/v1/admin/cloud", cloudHandlers[3]),
		)
	}

	return mux
}

func home(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path != "/" {
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		writer.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(writer).Encode(map[string]string{"error": "not found"})
		return
	}
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		writer.Header().Set("Allow", http.MethodGet+", "+http.MethodHead)
		http.Error(writer, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}

	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	writer.WriteHeader(http.StatusOK)
	if request.Method == http.MethodGet {
		_, _ = writer.Write([]byte(homePage))
	}
}
