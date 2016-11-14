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
      require => Vcsrepo["${project_root}/higlass"],
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
  include higlass

  class higlass_server {

    # Clone higlass-server repo
    vcsrepo { "${project_root}/higlass-server":
      ensure   => present,
      provider => git,
      source   => "https://github.com/hms-dbmi/higlass-server.git",
      revision => 'dev',
    }

    # Create higlass-server virtualenv
    python::virtualenv { $virtualenv_higlass_server:
      ensure  => present,
      owner   => $app_user,
      group   => $app_group,
      require => [Class['venvdeps'], Vcsrepo["${project_root}/higlass-server"]],
    }
    # Install higlass-server requirements
    exec{ "install_higlass_requirements":
      command => "${$virtualenv_higlass_server}/bin/pip install -r ${project_root}/higlass-server/api/requirements.txt",
      user        => $app_user,
      group       => $app_group,
      timeout     => 0,
      require => Python::Virtualenv[$virtualenv_higlass_server],
    }
  }
  include higlass_server
}