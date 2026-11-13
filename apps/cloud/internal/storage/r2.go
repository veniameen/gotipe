package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type R2Store struct {
	client *s3.Client
	bucket string
}

func NewR2Store(ctx context.Context, accountID, accessKeyID, secretKey, bucket, endpoint string, usePathStyle bool) (*R2Store, error) {
	var endpointURL string
	if endpoint != "" {
		endpointURL = endpoint // MinIO for dev
	} else if accountID != "" {
		endpointURL = fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)
	} else {
		return nil, fmt.Errorf("either S3_ENDPOINT or R2_ACCOUNT_ID must be set")
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKeyID, secretKey, "")),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpointURL)
		o.UsePathStyle = usePathStyle
	})

	return &R2Store{
		client: client,
		bucket: bucket,
	}, nil
}

func (s *R2Store) Put(ctx context.Context, key string, data []byte) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
		Body:   bytes.NewReader(data),
	})
	return err
}

func (s *R2Store) Get(ctx context.Context, key string) ([]byte, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, err
	}
	defer out.Body.Close()
	data, err := io.ReadAll(io.LimitReader(out.Body, MaxObjectBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > MaxObjectBytes {
		return nil, fmt.Errorf("object exceeds %d bytes", MaxObjectBytes)
	}
	return data, nil
}

func (s *R2Store) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *R2Store) HeadBucket(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(s.bucket),
	})
	return err
}

// PresignedURL generates a presigned GET URL for export downloads
func (s *R2Store) PresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	presigner := s3.NewPresignClient(s.client)
	req, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expiry))
	if err != nil {
		return "", err
	}
	return req.URL, nil
}
