package service

import (
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

// Date format options accepted through ImportColumnMapping.DateFormat.
// "auto" samples the parsed values and picks a deterministic layout.
const (
	importDateFormatAuto  = "auto"      // 2006-01-02
	importDateFormatISO   = "iso"       // 2006-01-02
	importDateFormatDMY   = "dmy"       // 02/01/2006
	importDateFormatMDY   = "mdy"       // 01/02/2006
	importDateFormatYMD_S = "ymd_slash" // 2006/01/02
	importDateFormatDMY_D = "dmy_dash"  // 02-01-2006
	importDateFormatDMY_M = "dmy_month" // 02-Jan-2006
)

const (
	importMaxRows    = 500
	importMaxColumns = 64
)

var importDateLayouts = []struct {
	name   string
	layout string
}{
	{importDateFormatISO, "2006-01-02"},
	{"", "2006-01-02T15:04:05Z07:00"},
	{importDateFormatYMD_S, "2006/01/02"},
	{importDateFormatDMY, "02/01/2006"},
	{importDateFormatMDY, "01/02/2006"},
	{importDateFormatDMY_D, "02-01-2006"},
	{importDateFormatDMY_M, "02-Jan-2006"},
	{importDateFormatDMY_M, "2-Jan-2006"},
	{"", "Jan 2, 2006"},
	{"", "2 Jan 2006"},
}

type importParseResult struct {
	rows       []model.ImportRow
	dateFormat string
	parseError *FieldError
}

// parseStatementCSV converts raw CSV text into review rows using the supplied
// column mapping. Parsing never fails wholesale for row-level problems; bad
// rows become ImportRowInvalid entries that the user must fix or ignore.
func parseStatementCSV(raw string, mapping model.ImportColumnMapping) importParseResult {
	result := importParseResult{}
	if strings.TrimSpace(raw) == "" {
		result.parseError = &FieldError{Field: "csv", Message: "must contain at least one row"}
		return result
	}
	if mapping.DateColumn < 0 || mapping.DateColumn >= importMaxColumns {
		result.parseError = &FieldError{Field: "dateColumn", Message: "is required"}
		return result
	}
	if mappingErr := validateColumnMapping(mapping); mappingErr != nil {
		result.parseError = mappingErr.(*FieldError)
		return result
	}
	if !isValidImportDateFormat(mapping.DateFormat) {
		result.parseError = &FieldError{Field: "dateFormat", Message: "is not a supported date format"}
		return result
	}
	if mapping.AmountMode != "" && !isValidImportAmountMode(mapping.AmountMode) {
		result.parseError = &FieldError{Field: "amountMode", Message: "is not supported"}
		return result
	}

	reader := csv.NewReader(strings.NewReader(raw))
	reader.FieldsPerRecord = -1
	reader.TrimLeadingSpace = true
	records, err := reader.ReadAll()
	if err != nil {
		result.parseError = &FieldError{Field: "csv", Message: "could not be parsed as CSV text"}
		return result
	}
	start := 0
	if mapping.HasHeader {
		start = 1
	}
	if len(records) <= start {
		result.parseError = &FieldError{Field: "csv", Message: "must contain at least one data row"}
		return result
	}
	if len(records)-start > importMaxRows {
		result.parseError = &FieldError{
			Field:   "csv",
			Message: fmt.Sprintf("must contain at most %d data rows", importMaxRows),
		}
		return result
	}

	dateFormat := mapping.DateFormat
	if dateFormat == "" || dateFormat == importDateFormatAuto {
		dateFormat = detectDateFormat(records[start:])
	}
	amountMode := mapping.AmountMode
	if amountMode == "" {
		amountMode = inferAmountMode(mapping)
	}

	for index, record := range records[start:] {
		row := parseImportRow(index, record, mapping, dateFormat, amountMode)
		result.rows = append(result.rows, row)
	}
	result.dateFormat = dateFormat
	return result
}

func validateColumnMapping(mapping model.ImportColumnMapping) error {
	columns := map[string]int{
		"descriptionColumn": mapping.DescriptionColumn,
		"amountColumn":      mapping.AmountColumn,
		"debitColumn":       mapping.DebitColumn,
		"creditColumn":      mapping.CreditColumn,
		"notesColumn":       mapping.NotesColumn,
		"referenceColumn":   mapping.ReferenceColumn,
	}
	for name, index := range columns {
		if index < -1 || index >= importMaxColumns {
			return &FieldError{Field: name, Message: fmt.Sprintf("must be between -1 and %d", importMaxColumns-1)}
		}
	}
	mode := mapping.AmountMode
	if mode == "" {
		mode = inferAmountMode(mapping)
	}
	switch mode {
	case "two_column":
		if mapping.DebitColumn < 0 || mapping.CreditColumn < 0 {
			return &FieldError{Field: "debitColumn", Message: "and creditColumn are required for two-column statements"}
		}
	default:
		if mapping.AmountColumn < 0 {
			return &FieldError{Field: "amountColumn", Message: "is required"}
		}
	}
	return nil
}

func inferAmountMode(mapping model.ImportColumnMapping) string {
	if mapping.AmountColumn < 0 && (mapping.DebitColumn >= 0 || mapping.CreditColumn >= 0) {
		return "two_column"
	}
	return "signed"
}

func isValidImportDateFormat(value string) bool {
	switch value {
	case "", importDateFormatAuto, importDateFormatISO, importDateFormatDMY,
		importDateFormatMDY, importDateFormatYMD_S, importDateFormatDMY_D, importDateFormatDMY_M:
		return true
	}
	return false
}

func isValidImportAmountMode(value string) bool {
	switch value {
	case "", "signed", "expense_positive", "two_column":
		return true
	}
	return false
}

// detectDateFormat samples rows and picks the first layout that parses every
// sample. Ambiguous slash layouts fall back to day-first only when unambiguous
// evidence exists.
func detectDateFormat(records [][]string) string {
	samples := make([]string, 0, 8)
	for _, record := range records {
		if len(record) == 0 {
			continue
		}
		candidate := strings.TrimSpace(record[0])
		if candidate != "" {
			samples = append(samples, candidate)
		}
		if len(samples) >= 8 {
			break
		}
	}
	for _, layout := range importDateLayouts {
		if layout.name == importDateFormatDMY || layout.name == importDateFormatMDY {
			continue
		}
		if allSamplesParse(samples, layout.layout) {
			return layout.name
		}
	}
	dayFirst := true
	monthFirst := true
	hasAmbiguous := false
	for _, sample := range samples {
		value, ok := parseSlashDate(sample)
		if !ok {
			dayFirst, monthFirst = false, false
			continue
		}
		if value.first > 12 {
			monthFirst = false
		} else if value.second > 12 {
			dayFirst = false
		} else {
			hasAmbiguous = true
		}
	}
	switch {
	case dayFirst && monthFirst && hasAmbiguous:
		return importDateFormatDMY
	case monthFirst:
		return importDateFormatMDY
	default:
		return importDateFormatDMY
	}
}

type slashDateParts struct{ first, second int }

func parseSlashDate(sample string) (slashDateParts, bool) {
	parts := strings.FieldsFunc(sample, func(r rune) bool { return r == '/' || r == '-' })
	if len(parts) != 3 {
		return slashDateParts{}, false
	}
	first, err := strconv.Atoi(parts[0])
	if err != nil {
		return slashDateParts{}, false
	}
	second, err := strconv.Atoi(parts[1])
	if err != nil {
		return slashDateParts{}, false
	}
	if len(parts[0]) == 4 {
		// ISO-style ordering is handled by the dedicated layouts above.
		return slashDateParts{}, false
	}
	return slashDateParts{first: first, second: second}, true
}

func allSamplesParse(samples []string, layout string) bool {
	if len(samples) == 0 {
		return false
	}
	for _, sample := range samples {
		if _, err := time.Parse(layout, sample); err != nil {
			return false
		}
	}
	return true
}

func parseImportRow(
	index int,
	record []string,
	mapping model.ImportColumnMapping,
	dateFormat string,
	amountMode string,
) model.ImportRow {
	row := model.ImportRow{Index: index}
	cell := func(column int) string {
		if column < 0 || column >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[column])
	}

	rawDate := cell(mapping.DateColumn)
	description := cell(mapping.DescriptionColumn)
	notes := cell(mapping.NotesColumn)
	reference := cell(mapping.ReferenceColumn)

	row.RawDate = rawDate
	row.Description = description
	row.Notes = notes
	row.Reference = reference

	occurredAt, err := parseStatementDate(rawDate, dateFormat)
	if err != nil {
		row.State = model.ImportRowInvalid
		row.Error = "date is not recognised (" + rawDate + ")"
		return row
	}
	row.OccurredAt = occurredAt

	amountMinor, direction, amountErr := parseStatementAmount(record, mapping, amountMode)
	if amountErr != nil {
		row.State = model.ImportRowInvalid
		row.Error = amountErr.Error()
		return row
	}
	row.AmountMinor = amountMinor
	row.Direction = direction

	if description == "" {
		row.Description = "Statement transaction"
	}
	row.State = model.ImportRowNew
	row.Action = model.ImportRowActionCreate
	return row
}

func parseStatementDate(raw, dateFormat string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, fmt.Errorf("date is empty")
	}
	layouts := make([]string, 0, 4)
	switch dateFormat {
	case importDateFormatISO:
		layouts = append(layouts, "2006-01-02")
	case importDateFormatDMY:
		layouts = append(layouts, "02/01/2006")
	case importDateFormatMDY:
		layouts = append(layouts, "01/02/2006")
	case importDateFormatYMD_S:
		layouts = append(layouts, "2006/01/02")
	case importDateFormatDMY_D:
		layouts = append(layouts, "02-01-2006")
	case importDateFormatDMY_M:
		layouts = append(layouts, "02-Jan-2006", "2-Jan-2006")
	default:
		for _, layout := range importDateLayouts {
			if layout.layout != "02/01/2006" && layout.layout != "01/02/2006" {
				layouts = append(layouts, layout.layout)
			}
		}
	}
	for _, layout := range layouts {
		if value, err := time.Parse(layout, raw); err == nil {
			return value.UTC(), nil
		}
	}
	return time.Time{}, fmt.Errorf("could not parse date")
}

// parseStatementAmount normalizes single-column signed amounts, expense-first
// amounts, and debit/credit pairs into positive minor units with an explicit
// direction.
func parseStatementAmount(record []string, mapping model.ImportColumnMapping, amountMode string) (int64, string, error) {
	cell := func(column int) string {
		if column < 0 || column >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[column])
	}
	parse := func(raw string) (int64, error) {
		return parseStatementMoney(raw)
	}
	switch amountMode {
	case "two_column":
		debitRaw := cell(mapping.DebitColumn)
		creditRaw := cell(mapping.CreditColumn)
		switch {
		case debitRaw != "" && creditRaw != "":
			return 0, "", fmt.Errorf("both debit and credit amounts are set")
		case debitRaw != "":
			value, err := parse(debitRaw)
			if err != nil {
				return 0, "", fmt.Errorf("debit amount is not a valid number")
			}
			if value < 0 {
				return 0, "", fmt.Errorf("debit amount must not be negative")
			}
			return value, "debit", nil
		case creditRaw != "":
			value, err := parse(creditRaw)
			if err != nil {
				return 0, "", fmt.Errorf("credit amount is not a valid number")
			}
			if value < 0 {
				return 0, "", fmt.Errorf("credit amount must not be negative")
			}
			return value, "credit", nil
		default:
			return 0, "", fmt.Errorf("amount is missing")
		}
	case "expense_positive":
		value, err := parse(cell(mapping.AmountColumn))
		if err != nil {
			return 0, "", fmt.Errorf("amount is not a valid number")
		}
		if value < 0 {
			return -value, "credit", nil
		}
		if value == 0 {
			return 0, "", fmt.Errorf("amount must not be zero")
		}
		return value, "debit", nil
	default: // signed
		value, err := parse(cell(mapping.AmountColumn))
		if err != nil {
			return 0, "", fmt.Errorf("amount is not a valid number")
		}
		if value == 0 {
			return 0, "", fmt.Errorf("amount must not be zero")
		}
		if value < 0 {
			return -value, "debit", nil
		}
		return value, "credit", nil
	}
}

// parseStatementMoney strips currency symbols and separators, resolving both
// dot-decimal and comma-decimal conventions deterministically before parsing
// exact minor units without binary floating point rounding drift.
func parseStatementMoney(raw string) (int64, error) {
	cleaned := strings.TrimSpace(raw)
	negative := false
	if strings.HasPrefix(cleaned, "(") && strings.HasSuffix(cleaned, ")") {
		negative = true
		cleaned = cleaned[1 : len(cleaned)-1]
	}
	cleaned = strings.TrimPrefix(strings.TrimSpace(cleaned), "+")
	cleaned = strings.Map(func(r rune) rune {
		switch r {
		case ' ', '\t', '₹', '$', '€', '£':
			return -1
		}
		return r
	}, cleaned)
	if cleaned == "" {
		return 0, fmt.Errorf("empty number")
	}

	lastDot := strings.LastIndex(cleaned, ".")
	lastComma := strings.LastIndex(cleaned, ",")
	switch {
	case lastDot >= 0 && lastComma >= 0:
		if lastDot > lastComma {
			cleaned = strings.ReplaceAll(cleaned, ",", "")
		} else {
			cleaned = strings.ReplaceAll(cleaned, ".", "")
			cleaned = strings.Replace(cleaned, ",", ".", 1)
		}
	case lastComma >= 0:
		fractionLength := len(cleaned) - lastComma - 1
		if fractionLength > 0 && fractionLength <= 2 && strings.Count(cleaned, ",") == 1 {
			cleaned = strings.Replace(cleaned, ",", ".", 1)
		} else {
			cleaned = strings.ReplaceAll(cleaned, ",", "")
		}
	}
	if strings.Count(cleaned, ".") > 1 {
		return 0, fmt.Errorf("invalid number")
	}

	if strings.HasPrefix(cleaned, "-") {
		negative = true
		cleaned = strings.TrimPrefix(cleaned, "-")
	}
	intPart := cleaned
	fractionPart := ""
	if dotIndex := strings.Index(cleaned, "."); dotIndex >= 0 {
		intPart = cleaned[:dotIndex]
		fractionPart = cleaned[dotIndex+1:]
	}
	if len(fractionPart) > 2 || !allDigits(intPart) || !allDigits(fractionPart) || intPart == "" {
		return 0, fmt.Errorf("invalid number")
	}
	if len(fractionPart) == 1 {
		fractionPart += "0"
	}
	units, err := strconv.ParseInt(intPart, 10, 64)
	if err != nil || units > model.MaxMoneyMinor/100 {
		return 0, fmt.Errorf("invalid number")
	}
	var minor int64
	if fractionPart != "" {
		minor, err = strconv.ParseInt(fractionPart, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid number")
		}
	} else {
		minor = 0
	}
	result := units*100 + minor
	if result > model.MaxMoneyMinor {
		return 0, fmt.Errorf("amount exceeds the supported maximum")
	}
	if negative {
		result = -result
	}
	return result, nil
}

func allDigits(value string) bool {
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}
