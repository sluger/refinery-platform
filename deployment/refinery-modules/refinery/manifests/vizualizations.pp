class refinery::vizualizations {

  class higlass {

    # Clone higlass repo
    vcsrepo { "${project_root}/higlass":
      ensure   => present,
      provider => git,
      source   => "https://github.com/hms-dbmi/higlass.git",
      revision => 'v0.2.4',
    }

    # Ensure directory to serve higlass static files from exists
    file { "${django_root}/static/source/js/higlass":
      ensure => 'directory',
    }

    # Move higlass files to proper directory
    file { "${django_root}/static/source/js/higlass/higlass.js":
      ensure => present,
      source => "${project_root}/higlass/dist/scripts/higlass.js",
    }
    file { "${django_root}/static/source/js/higlass/worker.js":
      ensure => present,
      source => "${project_root}/higlass/dist/scripts/worker.js",
    }

  }

  class higlass_server {

    # Clone higlass-server repo
    vcsrepo { "${project_root}/higlass-server":
      ensure   => present,
      provider => git,
      source   => "https://github.com/hms-dbmi/higlass-server.git",
      revision => 'dev',
    }

    # Create higlass-server virtualenv and install requirements
    python::virtualenv { $virtualenv_higlass_server:
      ensure  => present,
      owner   => $app_user,
      group   => $app_group,
      require => [ Class['venvdeps']],
    }
    python::requirements { "${project_root}/higlass-server/api/requirements.txt" :
      virtualenv => "$virtualenv_higlass_server",
      owner   => $app_user,
      group   => $app_group,
    }

    # Run tornado as a background process
    # (Including this in supervisor causes conflicts as there is now
    # competition for two DJANGO_SETTINGS_MODULEs)
    exec{ "run_tornado_server":
      command => "sudo python run_tornado.py ${tornado_server_port} > tornado.out 2>&1 &",
      user        => $app_user,
      group       => $app_group,
      cwd         => "${project_root}/higlass-server/api/",
      path => ['/usr/bin/', "${virtualenv_higlass_server}/bin/" ]
    }
  }
}