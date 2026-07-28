package filehash

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
)

type fakeObjectReader struct {
	open func(context.Context, string) (io.ReadCloser, error)
}

func (r fakeObjectReader) GetObject(
	ctx context.Context,
	objectKey string,
) (io.ReadCloser, error) {
	return r.open(ctx, objectKey)
}

type trackedReadCloser struct {
	reader   io.Reader
	closed   bool
	closeErr error
}

func (r *trackedReadCloser) Read(buffer []byte) (int, error) {
	return r.reader.Read(buffer)
}

func (r *trackedReadCloser) Close() error {
	r.closed = true
	return r.closeErr
}

func TestHashObjectStreamsKnownContent(t *testing.T) {
	content := []byte("hacom cloud")
	stream := &trackedReadCloser{reader: bytes.NewReader(content)}
	var logs bytes.Buffer
	service, err := NewService(
		fakeObjectReader{open: func(
			_ context.Context,
			objectKey string,
		) (io.ReadCloser, error) {
			if objectKey != "uploads/owner/object" {
				t.Fatalf("object key = %q", objectKey)
			}
			return stream, nil
		}},
		slog.New(slog.NewJSONHandler(&logs, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}

	result, err := service.HashObject(
		context.Background(),
		"uploads/owner/object",
	)
	if err != nil {
		t.Fatal(err)
	}
	const expectedChecksum = "c68be5d86064571348a78102d67519a983dc05a83694f9ddd7e0959521afe2e7"
	if result.Checksum != expectedChecksum {
		t.Fatalf("checksum = %q, want sha256sum result %q", result.Checksum, expectedChecksum)
	}
	if result.SizeBytes != int64(len(content)) {
		t.Fatalf("size = %d, want %d", result.SizeBytes, len(content))
	}
	if !stream.closed {
		t.Fatal("object stream was not closed")
	}
	if strings.Contains(logs.String(), "uploads/owner/object") {
		t.Fatal("object key leaked into hash completion log")
	}
}

type boundedStreamingReader struct {
	remaining int64
	maxBuffer int
}

func (r *boundedStreamingReader) Read(buffer []byte) (int, error) {
	if len(buffer) > r.maxBuffer {
		return 0, errors.New("reader was asked for an oversized buffer")
	}
	if r.remaining == 0 {
		return 0, io.EOF
	}
	count := len(buffer)
	if int64(count) > r.remaining {
		count = int(r.remaining)
	}
	for index := 0; index < count; index++ {
		buffer[index] = byte(index % 251)
	}
	r.remaining -= int64(count)
	return count, nil
}

func TestHashObjectUsesBoundedStreaming(t *testing.T) {
	const objectSize = int64(8 * 1024 * 1024)
	stream := &trackedReadCloser{reader: &boundedStreamingReader{
		remaining: objectSize,
		maxBuffer: 32 * 1024,
	}}
	service, err := NewService(
		fakeObjectReader{open: func(
			context.Context,
			string,
		) (io.ReadCloser, error) {
			return stream, nil
		}},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	if err != nil {
		t.Fatal(err)
	}

	result, err := service.HashObject(context.Background(), "large-object")
	if err != nil {
		t.Fatal(err)
	}
	if result.SizeBytes != objectSize {
		t.Fatalf("size = %d, want %d", result.SizeBytes, objectSize)
	}
	if len(result.Checksum) != sha256.Size*2 {
		t.Fatalf("checksum length = %d", len(result.Checksum))
	}
}

type failingReader struct {
	err error
}

func (r failingReader) Read([]byte) (int, error) {
	return 0, r.err
}

func TestHashObjectClosesStreamWhenReadFails(t *testing.T) {
	readErr := errors.New("stream interrupted")
	stream := &trackedReadCloser{reader: failingReader{err: readErr}}
	service, _ := NewService(
		fakeObjectReader{open: func(
			context.Context,
			string,
		) (io.ReadCloser, error) {
			return stream, nil
		}},
		nil,
	)

	_, err := service.HashObject(context.Background(), "object")
	if !errors.Is(err, readErr) {
		t.Fatalf("error = %v, want stream error", err)
	}
	if !stream.closed {
		t.Fatal("object stream was not closed after read failure")
	}
}

type contextReader struct {
	ctx    context.Context
	cancel context.CancelFunc
	read   bool
}

func (r *contextReader) Read(buffer []byte) (int, error) {
	if !r.read {
		r.read = true
		buffer[0] = 'x'
		r.cancel()
		return 1, nil
	}
	return 0, r.ctx.Err()
}

func TestHashObjectStopsWhenContextIsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	stream := &trackedReadCloser{reader: &contextReader{
		ctx:    ctx,
		cancel: cancel,
	}}
	service, _ := NewService(
		fakeObjectReader{open: func(
			context.Context,
			string,
		) (io.ReadCloser, error) {
			return stream, nil
		}},
		nil,
	)

	_, err := service.HashObject(ctx, "object")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context cancellation", err)
	}
	if !stream.closed {
		t.Fatal("object stream was not closed after cancellation")
	}
}

func TestHashObjectPropagatesOpenAndCloseErrors(t *testing.T) {
	openErr := errors.New("object unavailable")
	service, _ := NewService(
		fakeObjectReader{open: func(
			context.Context,
			string,
		) (io.ReadCloser, error) {
			return nil, openErr
		}},
		nil,
	)
	if _, err := service.HashObject(
		context.Background(),
		"object",
	); !errors.Is(err, openErr) {
		t.Fatalf("open error = %v", err)
	}

	closeErr := errors.New("close failed")
	service, _ = NewService(
		fakeObjectReader{open: func(
			context.Context,
			string,
		) (io.ReadCloser, error) {
			return &trackedReadCloser{
				reader:   strings.NewReader("content"),
				closeErr: closeErr,
			}, nil
		}},
		nil,
	)
	if _, err := service.HashObject(
		context.Background(),
		"object",
	); !errors.Is(err, closeErr) {
		t.Fatalf("close error = %v", err)
	}
}

func TestHashServiceRejectsInvalidDependenciesAndInput(t *testing.T) {
	if _, err := NewService(nil, nil); err == nil {
		t.Fatal("NewService(nil) error = nil")
	}
	service, _ := NewService(
		fakeObjectReader{open: func(
			context.Context,
			string,
		) (io.ReadCloser, error) {
			t.Fatal("object reader must not be called for invalid input")
			return nil, nil
		}},
		nil,
	)
	if _, err := service.HashObject(context.Background(), " "); err == nil {
		t.Fatal("blank object key error = nil")
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := service.HashObject(ctx, "object"); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled context error = %v", err)
	}
}
