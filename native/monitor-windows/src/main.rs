use std::collections::HashSet;
use std::io::{self, BufRead, Write};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

fn main() -> io::Result<()> {
    let mut system = System::new();
    let mut previous = HashSet::new();
    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout());
    for line in stdin.lock().lines() {
        if line? != "sample" {
            continue;
        }
        system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::new()
                .with_cpu()
                .with_memory()
                .with_cmd(UpdateKind::Always)
                .with_cwd(UpdateKind::Always),
        );
        let rows: Vec<_> = system
            .processes()
            .iter()
            .map(|(pid, process)| {
                let argv: Vec<_> = process
                    .cmd()
                    .iter()
                    .map(|arg| arg.to_string_lossy().into_owned())
                    .collect();
                serde_json::json!({
                    "pid": pid.as_u32(),
                    "parentPid": process.parent().map(|pid| pid.as_u32()).unwrap_or(0),
                    "command": process.name().to_string_lossy(),
                    "argv": argv,
                    "cwd": process.cwd().map(|path| path.to_string_lossy().into_owned()),
                    "startedAt": process.start_time() * 1000,
                    "memoryBytes": process.memory(),
                    "cpuPercent": if previous.contains(&(pid.as_u32(), process.start_time())) { Some(process.cpu_usage()) } else { None },
                })
            })
            .collect();
        serde_json::to_writer(
            &mut stdout,
            &serde_json::json!({"version": 1, "rows": rows}),
        )?;
        stdout.write_all(b"\n")?;
        stdout.flush()?;
        previous = system
            .processes()
            .iter()
            .map(|(pid, process)| (pid.as_u32(), process.start_time()))
            .collect();
    }
    Ok(())
}
