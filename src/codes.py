import argparse
import re
from collections import Counter
from pathlib import Path


def code_to_raw(hex_str: str, bit_length: int) -> str:
    hex_clean = hex_str.strip().lower().lstrip("0x")
    val = int(hex_clean, 16)

    # Preserve your original approach: 9 hex digits -> 36 bits; take top 33 by default.
    full_36bit = f"{val:036b}"
    raw_bits = full_36bit[:bit_length]
    return "".join("1" if b == "0" else "0" for b in raw_bits)


def read_button_names(txt_path: Path):
    names = []
    for line in txt_path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if s:
            names.append(s)
    return names


def parse_tokens_from_rtl_text(rtl_text: str, grep_keyword: str, one_per_line: bool):
    token_re = re.compile(r"\{(\d+)\}([0-9a-fA-F]+)")
    tokens = []  # (bits, code_hex)
    for line in rtl_text.splitlines():
        if grep_keyword not in line:
            continue
        matches = list(token_re.finditer(line))
        if not matches:
            continue
        if one_per_line:
            matches = matches[:1]
        for m in matches:
            tokens.append((int(m.group(1)), m.group(2).lower()))
    return tokens


def parse_flex_timings(rtl_text: str):
    """
    Extracts integers from patterns like:
      s=436,l=1128,r=5076,g=1144,t=277,y=0
    If a key is missing, it returns 0 for that key.
    """
    keys = ["s", "l", "r", "g", "t", "y"]
    found = {k: None for k in keys}

    # Find "s=..., l=..., ..." anywhere in text
    # Accept separators: commas or spaces
    for k in keys:
        m = re.search(rf"\b{k}\s*=\s*(\d+)\b", rtl_text)
        if m:
            found[k] = int(m.group(1))

    # Fill missing with 0
    for k in keys:
        if found[k] is None:
            found[k] = 0
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("device_prefix", help="e.g. lounge-fan")
    ap.add_argument("rtl_433_output_path", help="path to rtl_433 output text file (NOT grepped)")
    ap.add_argument("button_names_txt_path", help="txt file of button names in order")
    ap.add_argument("output_yaml_path", help="path to write generated ESPHome YAML")

    ap.add_argument("--grep", default="codes", help="keyword to filter lines (default: codes)")
    ap.add_argument("--one-per-line", action="store_true",
                    help="keep only first {N}HEX token per matching line")

    ap.add_argument(
        "--target-bits",
        type=int,
        default=None,
        help="Force bit length. If omitted, uses the most common {N} in the file."
    )

    # Mapping defaults (edit if your ESPHome expects different arrays)
    ap.add_argument("--sync-map", default="t,l", help="two keys for sync array (default: t,l)")
    ap.add_argument("--zero-map", default="y,r", help="two keys for zero array (default: y,r)")
    ap.add_argument("--one-map", default="g,r", help="two keys for one array (default: g,r)")

    args = ap.parse_args()

    device_prefix = args.device_prefix
    rtl_path = Path(args.rtl_433_output_path)
    names_path = Path(args.button_names_txt_path)
    out_path = Path(args.output_yaml_path)

    rtl_text = rtl_path.read_text(encoding="utf-8", errors="ignore")
    button_names = read_button_names(names_path)

    tokens = parse_tokens_from_rtl_text(
        rtl_text=rtl_text,
        grep_keyword=args.grep,
        one_per_line=args.one_per_line,
    )
    if not tokens:
        raise SystemExit(f"No {{N}}CODE tokens found on lines containing '{args.grep}'.")

    if args.target_bits is None:
        bits_counts = Counter(bits for bits, _ in tokens)
        target_bits = bits_counts.most_common(1)[0][0]
    else:
        target_bits = args.target_bits

    payload_hex_list = [code for (bits, code) in tokens if bits == target_bits]
    if not payload_hex_list:
        raise SystemExit(f"No tokens found matching target bits={target_bits}.")

    if len(button_names) != len(payload_hex_list):
        raise SystemExit(
            f"Count mismatch: {len(button_names)} names vs {len(payload_hex_list)} extracted payloads "
            f"(target_bits={target_bits}). Use --one-per-line if rtl_433 repeats tokens per line."
        )

    timings = parse_flex_timings(rtl_text)
    # timings keys: s,l,r,g,t,y (ints, missing->0)
    pulse_length = timings["s"]

    def map_array(spec: str):
        # spec like "t,l" -> [timings['t'], timings['l']]
        a, b = [x.strip() for x in spec.split(",")]
        return [timings[a], timings[b]]

    sync = map_array(args.sync_map)
    zero = map_array(args.zero_map)
    one = map_array(args.one_map)

    lines = []
    lines.append("script:")
    lines.append("  - id: send_rf_code")
    lines.append("    parameters:")
    lines.append("      code_binary: string")
    lines.append("    then:")
    lines.append("      - remote_transmitter.transmit_rc_switch_raw:")
    lines.append("          code: !lambda 'return code_binary;'")
    lines.append("          protocol:")
    lines.append(f"            pulse_length: {pulse_length}")
    lines.append(f"            sync: [{sync[0]}, {sync[1]}]")
    lines.append(f"            zero: [{zero[0]}, {zero[1]}]")
    lines.append(f"            one: [{one[0]}, {one[1]}]")
    lines.append("          repeat:")
    lines.append("            times: 7")
    lines.append("")
    lines.append("button:")

    for name, hex_payload in zip(button_names, payload_hex_list):
        final_name = f"{device_prefix}_{name}"
        code_binary = code_to_raw(hex_payload, bit_length=target_bits)

        # Ensure YAML-safe quoting (basic)
        safe_name = final_name.replace('"', '\\"')

        lines.append("  - platform: template")
        lines.append(f'    name: "{safe_name}"')
        lines.append("    on_press:")
        lines.append("      - script.execute:")
        lines.append("          id: send_rf_code")
        lines.append(f'          code_binary: "{code_binary}"  # {hex_payload}')

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
