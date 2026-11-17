//! UTC instants of review and version records.
//!
//! A [`Timestamp`] is written as RFC 3339 in UTC: a `Z` and as many fraction digits as the
//! instant needs (none, 3, 6 or 9), the text comments and versions have always carried. It
//! reads RFC 3339 with any offset. With the feature `clock`, [`Timestamp::now`] reads the
//! system clock, or the JavaScript one in a browser, which gives WebAssembly no system clock.

use std::fmt;
use std::str::FromStr;

use serde::{de, Deserialize, Deserializer, Serialize, Serializer};

const NANOS_PER_SECOND: u32 = 1_000_000_000;
const SECONDS_PER_DAY: i64 = 86_400;
/// Days from 0000-03-01 to 1970-01-01 in the proleptic Gregorian calendar.
const EPOCH_SHIFT: i64 = 719_468;
/// Days in 400 Gregorian years.
const DAYS_PER_ERA: i64 = 146_097;
/// 0000-01-01T00:00:00Z and 9999-12-31T23:59:59Z: the years a timestamp writes in four digits.
const FIRST_SECOND: i64 = -62_167_219_200;
const LAST_SECOND: i64 = 253_402_300_799;

/// An instant in UTC from the year 0000 to 9999, to the nanosecond.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Timestamp {
    seconds: i64,
    nanos: u32,
}

/// Text that is not an RFC 3339 instant in the years 0000 to 9999.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("not an RFC 3339 timestamp: {0:?}")]
pub struct TimestampError(String);

impl Timestamp {
    /// The current instant (feature `clock`).
    #[cfg(feature = "clock")]
    pub fn now() -> Self {
        let (seconds, nanos) = clock::now();
        Timestamp { seconds, nanos }
    }

    /// The instant `seconds` after 1970-01-01T00:00:00Z and `nanos` past that second, if it
    /// falls in the years 0000 to 9999.
    pub fn from_unix(seconds: i64, nanos: u32) -> Option<Self> {
        (nanos < NANOS_PER_SECOND && (FIRST_SECOND..=LAST_SECOND).contains(&seconds))
            .then_some(Timestamp { seconds, nanos })
    }

    /// Whole seconds since 1970-01-01T00:00:00Z.
    pub fn unix_seconds(self) -> i64 {
        self.seconds
    }

    /// Nanoseconds past the whole second.
    pub fn subsec_nanos(self) -> u32 {
        self.nanos
    }
}

#[cfg(all(
    feature = "clock",
    not(all(target_arch = "wasm32", target_os = "unknown"))
))]
mod clock {
    use std::time::{SystemTime, UNIX_EPOCH};

    pub(super) fn now() -> (i64, u32) {
        match SystemTime::now().duration_since(UNIX_EPOCH) {
            Ok(after) => (after.as_secs() as i64, after.subsec_nanos()),
            // a clock set before 1970: count back, keeping the nanoseconds positive
            Err(before) => {
                let before = before.duration();
                match before.subsec_nanos() {
                    0 => (-(before.as_secs() as i64), 0),
                    nanos => (
                        -(before.as_secs() as i64) - 1,
                        super::NANOS_PER_SECOND - nanos,
                    ),
                }
            }
        }
    }
}

#[cfg(all(feature = "clock", target_arch = "wasm32", target_os = "unknown"))]
mod clock {
    pub(super) fn now() -> (i64, u32) {
        // Date.now(): whole milliseconds since 1970-01-01T00:00:00Z
        let millis = js_sys::Date::now() as i64;
        (
            millis.div_euclid(1000),
            (millis.rem_euclid(1000) * 1_000_000) as u32,
        )
    }
}

impl fmt::Display for Timestamp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let (year, month, day) = civil_from_days(self.seconds.div_euclid(SECONDS_PER_DAY));
        let second = self.seconds.rem_euclid(SECONDS_PER_DAY);
        write!(
            f,
            "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}",
            second / 3600,
            second / 60 % 60,
            second % 60
        )?;
        match self.nanos {
            0 => Ok(()),
            nanos if nanos % 1_000_000 == 0 => write!(f, ".{:03}", nanos / 1_000_000),
            nanos if nanos % 1_000 == 0 => write!(f, ".{:06}", nanos / 1_000),
            nanos => write!(f, ".{nanos:09}"),
        }?;
        f.write_str("Z")
    }
}

impl FromStr for Timestamp {
    type Err = TimestampError;

    /// `YYYY-MM-DDTHH:MM:SS[.fraction]` and `Z` or `±HH:MM`. The date and the time may be
    /// parted by `t` or a space, the zone may be `z` or `±HHMM`; a fraction beyond
    /// nanoseconds is cut, a leap second runs into the next minute.
    fn from_str(text: &str) -> Result<Self, Self::Err> {
        parse(text).ok_or_else(|| TimestampError(text.to_owned()))
    }
}

impl Serialize for Timestamp {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for Timestamp {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Text;

        impl de::Visitor<'_> for Text {
            type Value = Timestamp;

            fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str("an RFC 3339 timestamp")
            }

            fn visit_str<E: de::Error>(self, text: &str) -> Result<Timestamp, E> {
                text.parse().map_err(E::custom)
            }
        }

        deserializer.deserialize_str(Text)
    }
}

fn parse(text: &str) -> Option<Timestamp> {
    let mut cursor = Cursor {
        text: text.as_bytes(),
        at: 0,
    };
    let year = cursor.digits(4)?;
    cursor.one_of(b"-")?;
    let month = cursor.digits(2)?;
    cursor.one_of(b"-")?;
    let day = cursor.digits(2)?;
    cursor.one_of(b"Tt ")?;
    let hour = cursor.digits(2)?;
    cursor.one_of(b":")?;
    let minute = cursor.digits(2)?;
    cursor.one_of(b":")?;
    let second = cursor.digits(2)?;
    let nanos = if cursor.one_of(b".").is_some() {
        cursor.fraction()?
    } else {
        0
    };
    let offset = cursor.zone()?;
    let valid = cursor.at == text.len()
        && (1..=12).contains(&month)
        && (1..=days_in_month(year, month)).contains(&day)
        && hour <= 23
        && minute <= 59
        && second <= 60;
    if !valid {
        return None;
    }
    let local =
        days_from_civil(year, month, day) * SECONDS_PER_DAY + hour * 3600 + minute * 60 + second;
    Timestamp::from_unix(local - offset, nanos)
}

/// A reader over the ASCII of a timestamp.
struct Cursor<'a> {
    text: &'a [u8],
    at: usize,
}

impl Cursor<'_> {
    fn one_of(&mut self, allowed: &[u8]) -> Option<()> {
        let byte = *self.text.get(self.at)?;
        allowed.contains(&byte).then(|| self.at += 1)
    }

    fn digit(&mut self) -> Option<i64> {
        let byte = *self.text.get(self.at)?;
        byte.is_ascii_digit().then(|| {
            self.at += 1;
            i64::from(byte - b'0')
        })
    }

    fn digits(&mut self, count: usize) -> Option<i64> {
        (0..count).try_fold(0, |value, _| Some(value * 10 + self.digit()?))
    }

    /// One or more digits after the point, in nanoseconds; digits past the ninth are cut.
    fn fraction(&mut self) -> Option<u32> {
        let mut nanos = 0;
        let mut scale = NANOS_PER_SECOND;
        let mut read = 0;
        while let Some(digit) = self.digit() {
            scale /= 10;
            nanos += digit as u32 * scale;
            read += 1;
        }
        (read > 0).then_some(nanos)
    }

    /// The zone's offset from UTC in seconds: `Z`, `±HH:MM` or `±HHMM`.
    fn zone(&mut self) -> Option<i64> {
        if self.one_of(b"Zz").is_some() {
            return Some(0);
        }
        let sign = match *self.text.get(self.at)? {
            b'+' => 1,
            b'-' => -1,
            _ => return None,
        };
        self.at += 1;
        let hours = self.digits(2)?;
        let _ = self.one_of(b":");
        let minutes = self.digits(2)?;
        (hours <= 23 && minutes <= 59).then_some(sign * (hours * 3600 + minutes * 60))
    }
}

/// The date of a count of days since 1970-01-01 (Howard Hinnant's `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let shifted = days + EPOCH_SHIFT;
    let era = shifted.div_euclid(DAYS_PER_ERA);
    let day_of_era = shifted.rem_euclid(DAYS_PER_ERA);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_from_march = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_from_march + 2) / 5 + 1;
    let month = if month_from_march < 10 {
        month_from_march + 3
    } else {
        month_from_march - 9
    };
    (year_of_era + era * 400 + i64::from(month <= 2), month, day)
}

/// The count of days since 1970-01-01 of a date (Howard Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = year.div_euclid(400);
    let year_of_era = year.rem_euclid(400);
    let month_from_march = (month + 9) % 12;
    let day_of_year = (153 * month_from_march + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * DAYS_PER_ERA + day_of_era - EPOCH_SHIFT
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

#[cfg(test)]
mod tests;
