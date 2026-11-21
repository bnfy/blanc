"""Exercise the pinned installer's actual configuration and template renderer."""
import json
import pathlib
import subprocess
import sys

src, out, channel, repo, deb_arch, rpm_arch = sys.argv[1:]
out = pathlib.Path(out)
common = out / "installer/common"
sys.path.insert(0, str(pathlib.Path(src) / "chrome/installer/linux/common"))
import installer


def config(fmt, arch):
    parser = installer.parse_common_args()
    argv = ["-a", arch, "-b", "1", "-c", channel, "-d", "chromium",
            "-r", repo, "-o", str(out), "-t", "linux"]
    if fmt == installer.PackageFormat.DEB:
        parser.add_argument("-s", "--sysroot")
        argv += ["-s", "."]
    return installer.InstallerConfig.from_args(parser.parse_args(argv), out, fmt)


def render(template, cfg):
    dest = out / template.name
    installer.process_template(template, dest, cfg.get_template_context())
    return dest


deb = config(installer.PackageFormat.DEB, deb_arch)
rpm = config(installer.PackageFormat.RPM, rpm_arch)
artifacts = deb.get_artifacts()
desktop = render(common / "desktop.template", deb).read_text()
apparmor = render(common / "apparmor.template", deb).read_text()
apt = render(common / "apt.include", deb)
dnf = render(common / "rpm.include", rpm)
rpm_artifacts = rpm.get_artifacts()
spec = render(out / "installer/rpm/chrome.spec.template", rpm)
scripts = [render(out / "installer/debian" / name, deb).read_text()
           for name in ("postinst", "prerm", "postrm")]
scripts += [render(common / "repo.cron", deb).read_text(),
            render(common / "rpmrepo.cron", rpm).read_text(), spec.read_text()]


def content(script, function):
    return subprocess.check_output(["bash", "-c", '. "$1"; ' + function,
                                    "probe", str(script)], text=True).strip()


print(json.dumps(dict(info=deb.info_vars, release=deb.releasenotes,
                      wm=deb.startup_wm_class, deb=deb.repoconfig, rpm=rpm.repoconfig,
                      apt=content(apt, "gen_sources_content"), dnf=content(dnf, "gen_repo_content"),
                      artifacts=[str(a.dst) for a in artifacts if not a.is_optional],
                      rpmArtifacts=[str(a.dst) for a in rpm_artifacts if not a.is_optional],
                      desktop=desktop, apparmor=apparmor, scripts=scripts)))
