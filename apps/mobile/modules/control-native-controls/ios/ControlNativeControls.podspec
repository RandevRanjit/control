Pod::Spec.new do |s|
  s.name           = 'ControlNativeControls'
  s.version        = '1.0.0'
  s.summary        = 'Native UIKit controls for CONTROL mobile.'
  s.description    = 'UIKit-backed controls that match native iOS navigation chrome.'
  s.author         = 'Control'
  s.homepage       = 'https://github.com/RandevRanjit/control'
  s.platforms      = {
    :ios => '18.0',
  }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
