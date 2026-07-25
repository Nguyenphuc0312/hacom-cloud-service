package upload

import (
	"errors"
	"testing"
)

func TestValidateSize(t *testing.T) {
	const maximum = int64(100 * 1024 * 1024)

	tests := []struct {
		name    string
		size    int64
		wantErr error
	}{
		{name: "valid file", size: 1024},
		{name: "exact limit", size: maximum},
		{name: "over limit", size: maximum + 1, wantErr: ErrFileTooLarge},
		{name: "empty file", size: 0, wantErr: errors.New("file size must be positive")},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateSize(test.size, maximum)
			if test.wantErr == nil && err != nil {
				t.Fatalf("ValidateSize() returned unexpected error: %v", err)
			}
			if test.wantErr != nil && (err == nil || err.Error() != test.wantErr.Error()) {
				t.Fatalf("ValidateSize() error = %v, want %v", err, test.wantErr)
			}
		})
	}
}
