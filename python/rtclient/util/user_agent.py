# Copyright (c) ZhiPu Corporation.
# Licensed under the MIT license.

import platform
from importlib.metadata import version, PackageNotFoundError


def get_user_agent():
    try:
        package_version = version("rtclient")
    except PackageNotFoundError:
        package_version = "dev"
        
    python_version = platform.python_version()
    system = platform.system()
    architecture = platform.machine()
    
    return f"zhipu-rtclient/{package_version} Python/{python_version} {system}/{architecture}"
