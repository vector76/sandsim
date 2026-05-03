//! GCode parser. See `docs/gcode-subset.md` for the supported dialect.

#[derive(Debug, Clone, Copy)]
pub struct ParserConfig {
    pub table_width_mm: f32,
    pub table_height_mm: f32,
    pub ball_radius_mm: f32,
    pub default_feedrate_mm_per_min: f32,
}

impl ParserConfig {
    pub fn reachable_max_x(&self) -> f32 {
        self.table_width_mm - 2.0 * self.ball_radius_mm
    }
    pub fn reachable_max_y(&self) -> f32 {
        self.table_height_mm - 2.0 * self.ball_radius_mm
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MoveEvent {
    pub line: u32,
    pub x_mm: f32,
    pub y_mm: f32,
    pub feedrate_mm_per_min: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Warning {
    pub line: u32,
    pub message: String,
    pub source: String,
}

#[derive(Debug, Default)]
pub struct ParseOutput {
    pub moves: Vec<MoveEvent>,
    pub warnings: Vec<Warning>,
}

pub fn parse(input: &str, config: &ParserConfig) -> ParseOutput {
    let mut state = ParserState::new(*config);
    for (idx, raw) in input.lines().enumerate() {
        state.process_line(raw, (idx + 1) as u32);
    }
    state.into_output()
}

const CLAMP_EPSILON: f32 = 1e-4;

#[derive(Clone, Copy)]
enum ModalG {
    None,
    G0,
    G1,
}

struct ParserState {
    config: ParserConfig,
    cur_x: f32,
    cur_y: f32,
    feedrate: f32,
    modal_g: ModalG,
    moves: Vec<MoveEvent>,
    warnings: Vec<Warning>,
}

impl ParserState {
    fn new(config: ParserConfig) -> Self {
        Self {
            config,
            cur_x: 0.0,
            cur_y: 0.0,
            feedrate: config.default_feedrate_mm_per_min,
            modal_g: ModalG::None,
            moves: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn process_line(&mut self, raw: &str, line_no: u32) {
        let original = raw.to_string();
        let no_comments = strip_comments(raw);
        let no_lineno = strip_line_number(&no_comments);
        let trimmed = no_lineno.trim();
        if trimmed.is_empty() {
            return;
        }

        // $H is its own special command
        if trimmed.eq_ignore_ascii_case("$h") {
            self.emit_homing(line_no);
            return;
        }
        if trimmed.starts_with('$') {
            self.warn(
                line_no,
                &original,
                format!("unsupported $-command: {}", trimmed),
            );
            return;
        }

        let tokens = match tokenize(trimmed) {
            Ok(t) => t,
            Err(msg) => {
                self.warn(line_no, &original, msg);
                return;
            }
        };

        self.process_tokens(line_no, &original, &tokens);
    }

    fn process_tokens(&mut self, line_no: u32, original: &str, tokens: &[Token]) {
        // Find G word(s)
        let g_codes: Vec<&Token> = tokens.iter().filter(|t| t.letter == 'G').collect();
        if g_codes.len() > 1 {
            self.warn(line_no, original, "multiple G codes on one line".to_string());
            return;
        }
        let g_code = g_codes.first().map(|t| t.value as i32);

        // Reject unsupported G codes early so the warning is specific
        if let Some(g) = g_code {
            if !matches!(g, 0 | 1 | 28) {
                self.warn(line_no, original, format!("unsupported G code: G{}", g));
                return;
            }
        }

        // Reject any unsupported letter (anything other than G, X, Y, Z, F)
        for tok in tokens {
            if !matches!(tok.letter, 'G' | 'X' | 'Y' | 'Z' | 'F') {
                self.warn(
                    line_no,
                    original,
                    format!("unsupported word: {}{}", tok.letter, format_value(tok.value)),
                );
                return;
            }
        }

        // Determine action from G code or modal G
        let action = match g_code {
            Some(0) => Action::Move(ModalG::G0),
            Some(1) => Action::Move(ModalG::G1),
            Some(28) => Action::Home,
            Some(_) => unreachable!("filtered above"),
            None => match self.modal_g {
                ModalG::None => Action::FeedrateOnly,
                g => Action::Move(g),
            },
        };

        // Extract X, Y, F (Z is dropped silently)
        let mut x: Option<f32> = None;
        let mut y: Option<f32> = None;
        let mut f: Option<f32> = None;
        for tok in tokens {
            match tok.letter {
                'X' => x = Some(tok.value as f32),
                'Y' => y = Some(tok.value as f32),
                'F' => f = Some(tok.value as f32),
                'Z' | 'G' => {}
                _ => unreachable!("filtered above"),
            }
        }

        if let Some(fr) = f {
            self.feedrate = fr;
        }

        match action {
            Action::Home => {
                self.emit_homing(line_no);
            }
            Action::Move(g) => {
                self.modal_g = g;
                if x.is_none() && y.is_none() {
                    return;
                }
                let target_x = x.unwrap_or(self.cur_x);
                let target_y = y.unwrap_or(self.cur_y);
                self.emit_move(line_no, original, target_x, target_y);
            }
            Action::FeedrateOnly => {
                if x.is_some() || y.is_some() {
                    self.warn(
                        line_no,
                        original,
                        "axis word without active modal G code".to_string(),
                    );
                }
            }
        }
    }

    fn emit_move(&mut self, line_no: u32, original: &str, target_x: f32, target_y: f32) {
        let max_x = self.config.reachable_max_x();
        let max_y = self.config.reachable_max_y();
        let clamped_x = target_x.clamp(0.0, max_x);
        let clamped_y = target_y.clamp(0.0, max_y);
        let was_clamped = (clamped_x - target_x).abs() > CLAMP_EPSILON
            || (clamped_y - target_y).abs() > CLAMP_EPSILON;
        if was_clamped {
            self.warn(
                line_no,
                original,
                format!(
                    "position ({:.3}, {:.3}) clamped to ({:.3}, {:.3})",
                    target_x, target_y, clamped_x, clamped_y
                ),
            );
        }
        self.moves.push(MoveEvent {
            line: line_no,
            x_mm: clamped_x,
            y_mm: clamped_y,
            feedrate_mm_per_min: self.feedrate,
        });
        self.cur_x = clamped_x;
        self.cur_y = clamped_y;
    }

    fn emit_homing(&mut self, line_no: u32) {
        // Move 1: (0, current_y)
        self.moves.push(MoveEvent {
            line: line_no,
            x_mm: 0.0,
            y_mm: self.cur_y,
            feedrate_mm_per_min: self.feedrate,
        });
        self.cur_x = 0.0;
        // Move 2: (0, 0)
        self.moves.push(MoveEvent {
            line: line_no,
            x_mm: 0.0,
            y_mm: 0.0,
            feedrate_mm_per_min: self.feedrate,
        });
        self.cur_y = 0.0;
    }

    fn warn(&mut self, line_no: u32, source: &str, msg: impl Into<String>) {
        self.warnings.push(Warning {
            line: line_no,
            message: msg.into(),
            source: source.to_string(),
        });
    }

    fn into_output(self) -> ParseOutput {
        ParseOutput {
            moves: self.moves,
            warnings: self.warnings,
        }
    }
}

enum Action {
    Move(ModalG),
    Home,
    FeedrateOnly,
}

#[derive(Debug, Clone, Copy)]
struct Token {
    letter: char,
    value: f64,
}

fn tokenize(line: &str) -> Result<Vec<Token>, String> {
    let mut tokens = Vec::new();
    let mut chars = line.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c.is_whitespace() {
            chars.next();
            continue;
        }
        if !c.is_ascii_alphabetic() {
            return Err(format!("unexpected character '{}'", c));
        }
        let letter = c.to_ascii_uppercase();
        chars.next();
        while let Some(&c) = chars.peek() {
            if c.is_whitespace() {
                chars.next();
            } else {
                break;
            }
        }
        let mut num_str = String::new();
        if let Some(&c) = chars.peek() {
            if c == '+' || c == '-' {
                num_str.push(c);
                chars.next();
            }
        }
        while let Some(&c) = chars.peek() {
            if c == '.' || c.is_ascii_digit() {
                num_str.push(c);
                chars.next();
            } else {
                break;
            }
        }
        if num_str.is_empty() || num_str == "+" || num_str == "-" {
            return Err(format!("expected number after '{}'", letter));
        }
        let value: f64 = num_str
            .parse()
            .map_err(|_| format!("invalid number '{}'", num_str))?;
        tokens.push(Token { letter, value });
    }
    Ok(tokens)
}

fn strip_comments(line: &str) -> String {
    let line = match line.find(';') {
        Some(idx) => &line[..idx],
        None => line,
    };
    let mut result = String::new();
    let mut in_paren = false;
    for c in line.chars() {
        match c {
            '(' if !in_paren => in_paren = true,
            ')' if in_paren => in_paren = false,
            _ if !in_paren => result.push(c),
            _ => {}
        }
    }
    result
}

fn strip_line_number(line: &str) -> String {
    let trimmed = line.trim_start();
    let bytes = trimmed.as_bytes();
    if bytes.is_empty() || !bytes[0].eq_ignore_ascii_case(&b'N') {
        return trimmed.to_string();
    }
    let mut i = 1;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i > 1 {
        trimmed[i..].to_string()
    } else {
        trimmed.to_string()
    }
}

fn format_value(v: f64) -> String {
    if v.is_finite() && v.fract() == 0.0 && v.abs() < 1e15 {
        format!("{}", v as i64)
    } else {
        format!("{}", v)
    }
}
