class refinery {

# for better performance
sysctl { 'vm.swappiness': value => '10' }

# to avoid empty ident name not allowed error when using git
user { $app_user: comment => $app_user }

file { "/home/${app_user}/.ssh/config":
  ensure => file,
  source => "${deployment_root}/ssh-config",
  owner  => $app_user,
  group  => $app_group,
}

file { ["${project_root}/isa-tab", "${project_root}/import", "${project_root}/static"]:
  ensure => directory,
  owner  => $app_user,
  group  => $app_group,
}

file_line { "django_settings_module":
  path => "/home/${app_user}/.profile",
  line => "export DJANGO_SETTINGS_MODULE=${django_settings_module}",
}
->
file { "${django_root}/config/config.json":
  ensure  => file,
  content => template("${django_root}/config/config.json.erb"),
  owner   => $app_user,
  group   => $app_group,
  replace => false,
}
->
exec { "migrate":
  command     => "${virtualenv}/bin/python ${django_root}/manage.py migrate --noinput",
  environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
  user        => $app_user,
  group       => $app_group,
  require     => [
    Class['::refinery::python'],
    Postgresql::Server::Db["refinery"]
  ],
}
->
exec { "create_superuser":
  command     => "${virtualenv}/bin/python ${django_root}/manage.py loaddata superuser.json",
  environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
  user        => $app_user,
  group       => $app_group,
  require     => Exec['migrate'],
}
->
exec { "create_guest":
  command     => "${virtualenv}/bin/python ${django_root}/manage.py loaddata guest.json",
  environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
  user        => $app_user,
  group       => $app_group,
}
  ->
exec { "add_users_to_public_group":
  command     => "${virtualenv}/bin/python ${django_root}/manage.py add_users_to_public_group",
  environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
  user        => $app_user,
  group       => $app_group,
}
->
exec { "set_up_refinery_site_name":
  command     => "${virtualenv}/bin/python ${django_root}/manage.py set_up_site_name '${site_name}' '${site_url}'",
  environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
  user        => $app_user,
  group       => $app_group,
}
->

file { "/opt":
  ensure => directory,
}

class solr {
  $solr_version = "5.3.1"
  $solr_archive = "solr-${solr_version}.tgz"
  $solr_url = "http://archive.apache.org/dist/lucene/solr/${solr_version}/${solr_archive}"

  package { 'java':
    name => 'openjdk-7-jdk',
  }
  exec { "solr_download":
    command => "wget ${solr_url} -O ${solr_archive}",
    cwd     => "/usr/local/src",
    creates => "/usr/local/src/${solr_archive}",
    path    => "/usr/bin",
    timeout => 600,  # downloading can take a long time
  }
  ->
  exec { "solr_extract_installer":
    command => "tar -xzf ${solr_archive} solr-${solr_version}/bin/install_solr_service.sh --strip-components=2",
    cwd     => "/usr/local/src",
    creates => "/usr/local/src/install_solr_service.sh",
    path    => "/bin",
  }
  ->
  file { "${django_root}/solr/core/conf/solrconfig.xml":
    ensure  => file,
    content => template("${django_root}/solr/core/conf/solrconfig.xml.erb"),
  }
  ->
  file { "${django_root}/solr/data_set_manager/conf/solrconfig.xml":
    ensure  => file,
    content => template("${django_root}/solr/data_set_manager/conf/solrconfig.xml.erb"),
  }
  ->
  exec { "solr_install":  # also starts the service
    command => "sudo bash ./install_solr_service.sh ${solr_archive} -u ${app_user}",
    cwd     => "/usr/local/src",
    creates => "/opt/solr-${solr_version}",
    path    => "/usr/bin:/bin",
    require => [ File["/opt"], Package['java'] ],
  }
  ->
  file_line { "solr_config_home":
    path  => "/var/solr/solr.in.sh",
    line  => "SOLR_HOME=${django_root}/solr",
    match => "^SOLR_HOME",
  }
  ->
  file_line { "solr_config_log":
    path  => "/var/solr/log4j.properties",
    line  => "solr.log=${django_root}/log",
    match => "^solr.log",
  }
  ~>
  service { 'solr':
    ensure     => running,
    hasrestart => true,
  }
}
include solr

class solrSynonymAnalyzer {
  $version = "2.0.0"
  $url = "https://github.com/refinery-platform/solr-synonyms-analyzer/releases/download/v${version}/hon-lucene-synonyms.jar"

  # Need to remove the old file manually as wget throws a weird
  # `HTTP request sent, awaiting response... 403 Forbidden` error when the file
  # already exists.

  exec { "solr-synonym-analyzer-download":
    command => "rm -f ${solr_lib_dir}/hon-lucene-synonyms.jar && wget -P ${solr_lib_dir} ${url}",
    creates => "${solr_lib_dir}/hon-lucene-synonyms.jar",
    path    => "/usr/bin:/bin",
    timeout => 120,  # downloading can take some time
    notify => Service['solr'],
    require => Exec['solr_install'],
  }
}
include solrSynonymAnalyzer



include '::rabbitmq'

class ui {
  apt::source { 'nodejs':
    ensure      => 'present',
    comment     => 'Nodesource NodeJS repo.',
    location    => 'https://deb.nodesource.com/node_6.x',
    release     => 'trusty',
    repos       => 'main',
    key         => {
      'id'     => '9FD3B784BC1C6FC31A8A0A1C1655A0AB68576280',
      'server' => 'keyserver.ubuntu.com',
    },
    include => {
      'src' => true,
      'deb' => true,
    },
  }
  ->
  package { 'nodejs':
    name    => 'nodejs',
    ensure  => latest,
    # https://forge.puppet.com/puppetlabs/apt/readme#adding-new-sources-or-ppas
    require => Class['apt::update'],
  }
  ->
  package {
    'bower': ensure => '1.7.7', provider => 'npm';
    'grunt-cli': ensure => '0.1.13', provider => 'npm';
  }
  ->
  exec { "npm_prune_local_modules":
    command   => "/usr/bin/npm prune --progress false",
    cwd       => $ui_app_root,
    logoutput => on_failure,
    user      => $app_user,
    group     => $app_group,
  }
  ->
  exec { "npm_install_local_modules":
    command   => "/usr/bin/npm install --progress false",
    cwd       => $ui_app_root,
    logoutput => on_failure,
    user      => $app_user,
    group     => $app_group,
  }
  ->
  exec { "bower_modules":
    command     => "/bin/rm -rf ${ui_app_root}/bower_components && /usr/bin/bower install --config.interactive=false",
    cwd         => $ui_app_root,
    logoutput   => on_failure,
    user        => $app_user,
    group       => $app_group,
    environment => ["HOME=/home/${app_user}"],
  }
  ->
  exec { "grunt":
    command   => "/usr/bin/grunt make",
    cwd       => $ui_app_root,
    logoutput => on_failure,
    user      => $app_user,
    group     => $app_group,
  }
  ->
  exec { "collectstatic":
    command     => "${virtualenv}/bin/python ${django_root}/manage.py collectstatic --clear --noinput",
    environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
    user        => $app_user,
    group       => $app_group,
    require     => Class['::refinery::python'],
  }
}
include ui

package { 'memcached': }
->
service { 'memcached':
  ensure => running,
}

file { "${django_root}/supervisord.conf":
  ensure  => file,
  content => template("${django_root}/supervisord.conf.erb"),
  owner   => $app_user,
  group   => $app_group,
}
->
exec { "supervisord":
  command     => "${virtualenv}/bin/supervisord",
  environment => ["DJANGO_SETTINGS_MODULE=${django_settings_module}"],
  cwd         => $django_root,
  creates     => "/tmp/supervisord.pid",
  user        => $app_user,
  group       => $app_group,
  require     => [
    Class["ui"],
    Class["solr"],
    Class["neo4j"],
    Class["::rabbitmq"],
    Service["memcached"],
  ],
}
}
