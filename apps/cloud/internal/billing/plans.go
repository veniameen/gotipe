package billing

type Plan struct {
	Name           string
	DocumentLimit  int64
	AIRequestLimit int64 // per month, -1 = unlimited
	ExportLimit    int64 // per month, -1 = unlimited
	MAULimit       int64
}

var Plans = map[string]Plan{
	"free":       {Name: "Free", DocumentLimit: 100, AIRequestLimit: 100, ExportLimit: 10, MAULimit: 10},
	"starter":    {Name: "Starter", DocumentLimit: 1_000, AIRequestLimit: 10_000, ExportLimit: 1_000, MAULimit: 1_000},
	"pro":        {Name: "Pro", DocumentLimit: 10_000, AIRequestLimit: 100_000, ExportLimit: -1, MAULimit: 10_000},
	"business":   {Name: "Business", DocumentLimit: 100_000, AIRequestLimit: 1_000_000, ExportLimit: -1, MAULimit: 100_000},
	"enterprise": {Name: "Enterprise", DocumentLimit: 1_000_000, AIRequestLimit: -1, ExportLimit: -1, MAULimit: -1},
}

func GetPlan(name string) Plan {
	if p, ok := Plans[name]; ok {
		return p
	}
	return Plans["free"]
}

func CheckDocumentQuota(plan string, currentCount int64) bool {
	p := GetPlan(plan)
	return currentCount < p.DocumentLimit
}

func CheckAIQuota(plan string, currentCount int64) bool {
	p := GetPlan(plan)
	if p.AIRequestLimit == -1 {
		return true
	}
	return currentCount < p.AIRequestLimit
}

func CheckExportQuota(plan string, currentCount int64) bool {
	p := GetPlan(plan)
	if p.ExportLimit == -1 {
		return true
	}
	return currentCount < p.ExportLimit
}
