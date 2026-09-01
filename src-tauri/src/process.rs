use std::collections::HashMap;
use sysinfo::{Pid, ProcessesToUpdate, System};

pub fn tree(root: u32) -> Vec<u32> {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();

    for (pid, process) in system.processes() {
        if let Some(parent) = process.parent() {
            children
                .entry(parent.as_u32())
                .or_default()
                .push(pid.as_u32());
        }
    }

    let mut found = vec![root];
    let mut queue = vec![root];

    while let Some(current) = queue.pop() {
        let Some(kids) = children.get(&current) else {
            continue;
        };

        for kid in kids {
            if !found.contains(kid) {
                found.push(*kid);
                queue.push(*kid);
            }
        }
    }

    found
}

#[cfg(windows)]
fn each_thread(pids: &[u32], suspend: bool) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows::Win32::System::Threading::{
        OpenThread, ResumeThread, SuspendThread, THREAD_SUSPEND_RESUME,
    };

    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) else {
            return;
        };

        let mut entry = THREADENTRY32 {
            dwSize: size_of::<THREADENTRY32>() as u32,
            ..Default::default()
        };

        if Thread32First(snapshot, &mut entry).is_ok() {
            loop {
                if pids.contains(&entry.th32OwnerProcessID) {
                    if let Ok(handle) =
                        OpenThread(THREAD_SUSPEND_RESUME, false, entry.th32ThreadID)
                    {
                        match suspend {
                            true => {
                                SuspendThread(handle);
                            }
                            false => {
                                ResumeThread(handle);
                            }
                        }

                        let _ = CloseHandle(handle);
                    }
                }

                entry.dwSize = size_of::<THREADENTRY32>() as u32;

                if Thread32Next(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);
    }
}

#[cfg(not(windows))]
fn each_thread(_pids: &[u32], _suspend: bool) {}

pub fn suspend(root: u32) {
    let pids = tree(root);
    each_thread(&pids, true);
}

pub fn resume(root: u32) {
    let pids = tree(root);
    each_thread(&pids, false);
}

pub fn terminate(root: u32) {
    let pids = tree(root);

    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    each_thread(&pids, false);

    for pid in pids.iter().rev() {
        if let Some(process) = system.process(Pid::from_u32(*pid)) {
            process.kill();
        }
    }
}
