require "xcodeproj"

root = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(root, "WidgetNow.xcodeproj"))
project.root_object.attributes["LastUpgradeCheck"] = "2620"
project.root_object.attributes["TargetAttributes"] = {}

app = project.new_target(:application, "WidgetNow", :ios, "17.0")
widget = project.new_target(:app_extension, "WidgetNowWidgets", :ios, "17.0")

shared = project.main_group.new_group("Shared", "Shared")
app_group = project.main_group.new_group("App", "App")
widget_group = project.main_group.new_group("WidgetExtension", "WidgetExtension")
config_group = project.main_group.new_group("Config", "Config")
development_config = config_group.new_file("Development.xcconfig")
production_config = config_group.new_file("Production.xcconfig")

{
  shared => %w[WidgetModels.swift WidgetCanvas.swift AccountSession.swift],
  app_group => %w[WidgetNowApp.swift GitHubBrowser.swift Assets.xcassets Info.plist WidgetNow.entitlements],
  widget_group => %w[WidgetNowWidgets.swift Info.plist WidgetNowWidgets.entitlements]
}.each do |group, names|
  names.each do |name|
    file = group.new_file(name)
    app.source_build_phase.add_file_reference(file) if group == shared || (group == app_group && name.end_with?(".swift"))
    app.resources_build_phase.add_file_reference(file) if group == app_group && name == "Assets.xcassets"
    widget.source_build_phase.add_file_reference(file) if group == shared || (group == widget_group && name.end_with?(".swift"))
  end
end

[project, app, widget].each do |configurable|
  configurable.build_configurations.each do |configuration|
    configuration.base_configuration_reference =
      configuration.name == "Debug" ? development_config : production_config
  end
end

package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
package.repositoryURL = "https://github.com/get-convex/convex-swift"
package.requirement = { "kind" => "exactVersion", "version" => "0.8.1" }
project.root_object.package_references << package

[app, widget].each do |target|
  product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  product.product_name = "ConvexMobile"
  product.package = package
  target.package_product_dependencies << product
  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = product
  target.frameworks_build_phase.files << build_file

  target.build_configurations.each do |configuration|
    settings = configuration.build_settings
    settings["SWIFT_VERSION"] = "5.0"
    settings["IPHONEOS_DEPLOYMENT_TARGET"] = "17.0"
    settings["TARGETED_DEVICE_FAMILY"] = "1"
    settings["CODE_SIGN_STYLE"] = "Automatic"
    settings["GENERATE_INFOPLIST_FILE"] = "NO"
    settings["SWIFT_EMIT_LOC_STRINGS"] = "YES"
    settings["EXCLUDED_ARCHS[sdk=iphonesimulator*]"] = "x86_64"
    settings["PRODUCT_BUNDLE_IDENTIFIER"] = target == app ? "com.widgetnow.companion" : "com.widgetnow.companion.widgets"
    folder = target == app ? "App" : "WidgetExtension"
    settings["INFOPLIST_FILE"] = "#{folder}/Info.plist"
    settings["CODE_SIGN_ENTITLEMENTS"] = "#{folder}/#{target == app ? 'WidgetNow.entitlements' : 'WidgetNowWidgets.entitlements'}"
    settings["SKIP_INSTALL"] = target == widget ? "YES" : "NO"
    settings["APPLICATION_EXTENSION_API_ONLY"] = "YES" if target == widget
  end
end

embed = app.new_copy_files_build_phase("Embed App Extensions")
embed.dst_subfolder_spec = "13"
embed.add_file_reference(widget.product_reference)
app.add_dependency(widget)

project.save
